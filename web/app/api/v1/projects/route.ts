/** GET /api/v1/projects — the token owner's projects and the backends in each. */
import { apiError, apiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const userId = await apiUser(request);
  if (!userId) return apiError(401, "Send a valid API token as Authorization: Bearer <token>.");
  const { data } = await createAdminClient()
    .from("projects")
    .select("id, name, targets (id, platform, heartbeat_type, url, label, interval_seconds)")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("created_at");
  const projects = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    targets: (p.targets ?? []).map((t) => ({
      id: t.id,
      kind: t.heartbeat_type === "inbound" ? "heartbeat" : t.platform,
      url: t.heartbeat_type === "inbound" ? undefined : t.url,
      label: t.label,
      interval_seconds: t.interval_seconds,
    })),
  }));
  return Response.json({ projects });
}
