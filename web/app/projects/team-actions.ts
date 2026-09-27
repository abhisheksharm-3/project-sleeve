"use server";
/**
 * Sharing a project. The owner makes single-use invite links and removes people; a member
 * can leave. An invite link's token is shown once and stored only as a SHA-256.
 */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashToken } from "@/lib/api-token";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_MEMBERS = 10;

export type InviteState = { link?: string; error?: string };

async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { user } = await requireUser();
  const projectId = String(formData.get("project_id") ?? "");
  if (!(await ownsProject(user.id, projectId)))
    return { error: "Only the project's owner can invite people." };
  const admin = createAdminClient();
  const { count } = await admin
    .from("project_members")
    .select("user_id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if ((count ?? 0) >= MAX_MEMBERS)
    return { error: `A project can be shared with ${MAX_MEMBERS} people.` };
  const token = randomBytes(24).toString("base64url");
  const { error } = await admin
    .from("project_invites")
    .insert({ project_id: projectId, token_hash: hashToken(token), created_by: user.id });
  if (error) return { error: "Could not make the invite." };
  return { link: `${siteUrl()}/invite/${token}` };
}

export async function acceptInvite(formData: FormData) {
  const { user } = await requireUser();
  const token = String(formData.get("token") ?? "");
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("project_invites")
    .select("id, project_id, created_by, expires_at, projects (user_id)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const owner = (invite?.projects as unknown as { user_id: string } | null)?.user_id;
  if (!invite || Date.parse(invite.expires_at) < Date.now() || !owner)
    redirect("/dashboard?error=That invite link has expired or was already used.");
  await admin.from("project_invites").delete().eq("id", invite.id);
  if (owner !== user.id)
    await admin
      .from("project_members")
      .upsert(
        { project_id: invite.project_id, user_id: user.id, added_by: invite.created_by },
        { onConflict: "project_id,user_id" },
      );
  redirect(`/projects/${invite.project_id}`);
}

export async function removeMember(formData: FormData) {
  const { user } = await requireUser();
  const projectId = String(formData.get("project_id") ?? "");
  if (!(await ownsProject(user.id, projectId))) redirect("/dashboard");
  await createAdminClient()
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", String(formData.get("user_id") ?? ""));
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}#people`);
}

export async function leaveProject(formData: FormData) {
  const { user } = await requireUser();
  await createAdminClient()
    .from("project_members")
    .delete()
    .eq("project_id", String(formData.get("project_id") ?? ""))
    .eq("user_id", user.id);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
