/**
 * Mondays: one message per user with a webhook and the digest on, covering the week's checks,
 * anything in trouble, the nearest pause deadline, and keep-alive workflows GitHub stopped.
 * A user sent one in the last six days is skipped, so a retried cron run cannot double-send.
 *
 * ponytail: reads each user's rows in turn; batch the queries if digests run past a minute.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/cron-auth.ts";
import { postWebhook } from "../_shared/webhook.ts";
import { composeDigest, type DigestBackend, type DigestWorkflow } from "./message.ts";

type Channel = { user_id: string; kind: string; webhook_url: string };
type Project = {
  name: string;
  scan: { workflows?: { name: string; state: string; lastRunAt: string | null }[] } | null;
  targets: { id: string; platform: string }[];
};
type HealthRow = {
  target_id: string;
  pings_7d: number;
  uptime_7d: number | null;
  failures_since_ok: number;
  pause_at: string | null;
  pause_window_seconds: number | null;
};

const RESEND_AFTER_MS = 6 * 86_400_000;

Deno.serve(async (req) => {
  if (!isCronRequest(req)) return new Response("forbidden", { status: 403 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const site = Deno.env.get("SITE_URL") ?? "https://projectsleeve.vercel.app";
  const now = Date.now();

  const { data: channels, error } = await db
    .from("notification_channels")
    .select("user_id, kind, webhook_url")
    .eq("digest", true)
    .or(
      `last_digest_at.is.null,last_digest_at.lt.${new Date(now - RESEND_AFTER_MS).toISOString()}`,
    );
  if (error) return new Response(`read failed: ${error.message}`, { status: 500 });

  let sent = 0;
  for (const c of (channels ?? []) as Channel[]) {
    const { data: projects } = await db
      .from("projects")
      .select("name, scan, targets (id, platform)")
      .eq("user_id", c.user_id)
      .eq("archived", false);
    const list = (projects ?? []) as Project[];
    const ids = list.flatMap((p) => p.targets.map((t) => t.id));
    const { data: rows } = ids.length
      ? await db.from("target_health").select("*").in("target_id", ids)
      : { data: [] };
    const health = new Map(((rows ?? []) as HealthRow[]).map((h) => [h.target_id, h]));

    const backends: DigestBackend[] = list.flatMap((p) =>
      p.targets.map((t) => {
        const h = health.get(t.id);
        const pings = h?.pings_7d ?? 0;
        return {
          project: p.name,
          platform: t.platform,
          pings7: pings,
          ok7: Math.round(((h?.uptime_7d ?? 0) / 100) * pings),
          failuresSinceOk: h?.failures_since_ok ?? 0,
          pauseAt: h?.pause_at ?? null,
          pauseWindowSeconds: h?.pause_window_seconds ?? null,
        };
      })
    );
    const workflows: DigestWorkflow[] = list.flatMap((p) =>
      (p.scan?.workflows ?? []).map((w) => ({ project: p.name, ...w }))
    );

    const text = composeDigest(backends, workflows, site, now);
    if (!text || !(await postWebhook(c.kind, c.webhook_url, text))) continue;
    await db
      .from("notification_channels")
      .update({ last_digest_at: new Date(now).toISOString() })
      .eq("user_id", c.user_id);
    sent++;
  }
  return Response.json({ channels: channels?.length ?? 0, sent });
});
