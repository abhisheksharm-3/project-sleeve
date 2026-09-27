"use server";
/** Every project and target mutation. Each one checks ownership, then entitlements, then writes. */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { entitlements } from "@/lib/entitlements";
import { track } from "@/lib/events";
import { GitHubTokenMissing, listRepos } from "@/lib/github";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPublicSupabaseKey } from "@/lib/supabase-key";
import { supabaseTableUrl, validateTargetUrl } from "@/lib/target-url";

const INTERVALS = [21_600, 43_200, 86_400];

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function userProjectIds(userId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("projects").select("id").eq("user_id", userId);
  return (data ?? []).map((p) => p.id);
}

async function countTargets(userId: string): Promise<number> {
  const ids = await userProjectIds(userId);
  if (ids.length === 0) return 0;
  const { count } = await createAdminClient()
    .from("targets")
    .select("id", { count: "exact", head: true })
    .in("project_id", ids);
  return count ?? 0;
}

/** Repo metadata is re-fetched from GitHub rather than trusted from the form. */
export async function importRepos(formData: FormData) {
  const { user } = await requireUser();
  const chosen = new Set(formData.getAll("repo").map(Number));
  if (chosen.size === 0) fail("/import", "Pick at least one repository.");

  let repos: Awaited<ReturnType<typeof listRepos>>;
  try {
    repos = (await listRepos(user.id)).filter((r) => chosen.has(r.github_id));
  } catch (e) {
    if (e instanceof GitHubTokenMissing)
      redirect("/login?error=Sign in again to read your repositories.");
    fail("/import", "GitHub is not answering right now. Try again in a minute.");
  }

  const limits = await entitlements(user.id);
  const existing = (await userProjectIds(user.id)).length;
  const room = limits.limits.max_projects - existing;
  if (room <= 0)
    fail("/import", `The ${limits.planName} plan allows ${limits.limits.max_projects} projects.`);

  const { error } = await createAdminClient()
    .from("projects")
    .upsert(
      repos.slice(0, room).map((r) => ({ ...r, user_id: user.id })),
      { onConflict: "user_id,github_id" },
    );
  if (error) fail("/import", "Could not save those projects.");

  await track(user.id, "repo_imported", { count: Math.min(repos.length, room) });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function createProject(formData: FormData) {
  const { user } = await requireUser();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 100);
  if (!name) fail("/import", "Give the project a name.");

  const limits = await entitlements(user.id);
  if (!limits.canAddProject((await userProjectIds(user.id)).length)) {
    fail("/import", `The ${limits.planName} plan allows ${limits.limits.max_projects} projects.`);
  }

  const { data, error } = await createAdminClient()
    .from("projects")
    .insert({ user_id: user.id, name })
    .select("id")
    .single();
  if (error || !data) fail("/import", "Could not create the project.");

  await track(user.id, "project_created");
  redirect(`/projects/${data.id}`);
}

type NewTarget = { platform: string; url: string; heartbeat_type: string; secret: string | null };

async function readSupabaseTarget(formData: FormData, back: string): Promise<NewTarget> {
  const url = supabaseTableUrl(
    String(formData.get("project_url") ?? ""),
    String(formData.get("table") ?? ""),
  );
  if (!url) fail(back, "Use your project URL (https://<ref>.supabase.co) and a table name.");
  const key = String(formData.get("anon_key") ?? "").trim();
  if (!isPublicSupabaseKey(key)) {
    fail(back, "That is not an anon or publishable key. Never paste a service-role key anywhere.");
  }
  return { platform: "supabase", url, heartbeat_type: "db_query", secret: key };
}

async function readCustomTarget(
  formData: FormData,
  back: string,
  allowed: string[],
): Promise<NewTarget> {
  const heartbeat = String(formData.get("heartbeat_type") ?? "plain");
  if (!allowed.includes(heartbeat)) fail(back, "Your plan does not include that heartbeat type.");
  const check = await validateTargetUrl(String(formData.get("url") ?? ""));
  if (!check.ok) fail(back, check.reason);
  return {
    platform: "custom",
    url: check.url,
    heartbeat_type: heartbeat,
    secret: heartbeat === "db_query" ? randomBytes(24).toString("base64url") : null,
  };
}

export async function addTarget(formData: FormData) {
  const { supabase, user } = await requireUser();
  const projectId = String(formData.get("project_id") ?? "");
  const back = `/projects/${projectId}`;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) fail("/dashboard", "That project is not yours.");

  const limits = await entitlements(user.id);
  if (!limits.canAddTarget(await countTargets(user.id))) {
    fail(back, `The ${limits.planName} plan allows ${limits.limits.max_targets} targets.`);
  }

  const target =
    formData.get("kind") === "supabase"
      ? await readSupabaseTarget(formData, back)
      : await readCustomTarget(formData, back, limits.allowedHeartbeatTypes());

  const requested = Number(formData.get("interval_seconds"));
  const interval = limits.clampInterval(INTERVALS.includes(requested) ? requested : INTERVALS[0]);

  const { data, error } = await createAdminClient()
    .from("targets")
    .insert({ ...target, project_id: projectId, interval_seconds: interval })
    .select("id")
    .single();
  if (error || !data) fail(back, "Could not save the target.");

  await track(user.id, "target_added", {
    platform: target.platform,
    heartbeat_type: target.heartbeat_type,
  });
  revalidatePath(back);
  redirect(`${back}?added=${data.id}`);
}

async function ownedTarget(targetId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("targets")
    .select("id, project_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!data) fail("/dashboard", "That target is not yours.");
  return { user, target: data };
}

/**
 * Brings the target's next run forward to now; the engine's next minute tick pings it.
 * The app never calls the engine directly — they share only the database (spec §3).
 */
export async function testTarget(formData: FormData) {
  const { user, target } = await ownedTarget(String(formData.get("target_id") ?? ""));
  await createAdminClient()
    .from("jobs")
    .update({ next_run_at: new Date().toISOString() })
    .eq("target_id", target.id)
    .eq("status", "idle");
  await track(user.id, "target_tested");
  redirect(`/projects/${target.project_id}?queued=${target.id}`);
}

export async function removeTarget(formData: FormData) {
  const { user, target } = await ownedTarget(String(formData.get("target_id") ?? ""));
  await createAdminClient().from("targets").delete().eq("id", target.id);
  await track(user.id, "target_removed");
  revalidatePath(`/projects/${target.project_id}`);
  redirect(`/projects/${target.project_id}`);
}
