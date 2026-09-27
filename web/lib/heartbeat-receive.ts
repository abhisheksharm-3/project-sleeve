/**
 * Records an inbound heartbeat. The token alone identifies the target, so an unknown or
 * malformed one is a 404 with nothing to learn from it.
 */
import "server-only";
import { MIN_PING_GAP_MS, TOKEN } from "./heartbeat";
import { createAdminClient } from "./supabase/admin";

export async function receiveHeartbeat(token: string, ok: boolean): Promise<Response> {
  if (!TOKEN.test(token)) return new Response("not found\n", { status: 404 });
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("targets")
    .select("id")
    .eq("secret", token)
    .eq("heartbeat_type", "inbound")
    .eq("enabled", true)
    .maybeSingle();
  if (!target) return new Response("not found\n", { status: 404 });

  const { data: last } = await admin
    .from("ping_log")
    .select("ran_at, ok")
    .eq("target_id", target.id)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const recent = last && Date.now() - Date.parse(last.ran_at) < MIN_PING_GAP_MS && last.ok === ok;
  if (!recent)
    await admin
      .from("ping_log")
      .insert({ target_id: target.id, ok, error: ok ? null : "job reported a failure" });
  return new Response(ok ? "ok\n" : "failure recorded\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
