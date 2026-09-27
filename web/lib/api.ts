/**
 * The public API's plumbing: authenticate a bearer token, and answer in one JSON shape.
 * Every handler reads and writes through the service role, scoped to the token's user.
 */
import "server-only";
import { bearerToken, hashToken } from "./api-token";
import { createAdminClient } from "./supabase/admin";

export function apiError(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status });
}

/** The token's user id, or null. Stamps last_used_at so the owner can see a token in use. */
export async function apiUser(request: Request): Promise<string | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return null;
  const { data } = await createAdminClient()
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .select("user_id")
    .maybeSingle();
  return data?.user_id ?? null;
}

export async function ownedProject(userId: string, projectId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(projectId)) return false;
  const { data } = await createAdminClient()
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export async function targetCount(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: projects } = await admin.from("projects").select("id").eq("user_id", userId);
  const ids = (projects ?? []).map((p) => p.id);
  if (!ids.length) return 0;
  const { count } = await admin
    .from("targets")
    .select("id", { count: "exact", head: true })
    .in("project_id", ids);
  return count ?? 0;
}
