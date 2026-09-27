/**
 * The public view of a project, for its status page and badge. Service-role reads, so the
 * public flag is the only gate: an unpublished project returns null. Returns backend types
 * and states, never a URL, project ref or key.
 */
import "server-only";
import { statusOf, targetTitle } from "./describe";
import { type Health, passRate, type State } from "./health";
import { createAdminClient } from "./supabase/admin";

export type PublicBackend = {
  slot: string;
  title: string;
  state: State;
  headline: string;
  uptime: number | null;
};
export type PublicStatus = {
  name: string;
  backends: PublicBackend[];
  rate: number | null;
  allAwake: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function loadPublicStatus(projectId: string): Promise<PublicStatus | null> {
  if (!UUID.test(projectId)) return null;
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("name, public, targets (id, url, platform, heartbeat_type)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.public) return null;

  const targets = (project.targets ?? []) as {
    id: string;
    url: string;
    platform: string;
    heartbeat_type: string;
  }[];
  const { data: rows } = targets.length
    ? await admin
        .from("target_health")
        .select("*")
        .in(
          "target_id",
          targets.map((t) => t.id),
        )
    : { data: [] };
  const health = new Map(((rows ?? []) as Health[]).map((h) => [h.target_id, h]));
  const now = Date.now();
  const backends = targets.map((t, position) => {
    const s = statusOf(t, health.get(t.id), now);
    return {
      slot: `backend-${position}`,
      title: targetTitle(t).title,
      state: s.state,
      headline: s.headline,
      uptime: health.get(t.id)?.uptime_7d ?? null,
    };
  });
  return {
    name: project.name.split("/").pop() ?? project.name,
    backends,
    rate: passRate([...health.values()]),
    allAwake: backends.length > 0 && backends.every((b) => b.state === "alive"),
  };
}
