/**
 * Reads a status page for its public address. Service-role reads, so the published flag, or
 * the viewer owning the page, is the only gate. Returns labels, states and numbers, never a
 * URL, project ref or key.
 */
import "server-only";
import { statusOf, targetTitle } from "./describe";
import type { Health, State } from "./health";
import { createAdminClient } from "./supabase/admin";
import { type DailyChecks, type DayCell, dayCells, uptimeOver } from "./uptime";

export const HISTORY_DAYS = 90;
const LATENCY_DAYS = 30;
const DAY_MS = 86_400_000;

export type PageItem = {
  key: string;
  label: string;
  state: State;
  lastFailed: boolean;
  cells: DayCell[];
  uptime: { d7: number | null; d30: number | null; d90: number | null };
  latency: (number | null)[];
  latencyNow: number | null;
};

export type Outage = { key: string; label: string; startedAt: string; endedAt: string | null };

export type PlannedWindow = {
  key: string;
  label: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
};

export type Notice = {
  id: number;
  kind: "incident" | "maintenance" | "notice";
  title: string;
  body: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type Overall = "empty" | "up" | "maintenance" | "degraded" | "partial" | "down";

export type StatusPageView = {
  title: string;
  description: string | null;
  published: boolean;
  showUptime: boolean;
  showResponseTime: boolean;
  showOutages: boolean;
  items: PageItem[];
  outages: Outage[];
  maintenance: PlannedWindow[];
  notices: Notice[];
  overall: Overall;
};

type TargetRow = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  label: string | null;
  projects: { name: string } | null;
};
type ItemRow = { label: string | null; position: number; targets: TargetRow | null };
type Daily = DailyChecks & { target_id: string };

const DOWN: State[] = ["failing", "paused"];

function overallOf(items: PageItem[]): Overall {
  if (items.length === 0) return "empty";
  const down = items.filter((i) => DOWN.includes(i.state)).length;
  if (down === 0) {
    if (items.some((i) => i.state === "maintenance")) return "maintenance";
    return items.some((i) => i.lastFailed) ? "degraded" : "up";
  }
  return down === items.length ? "down" : "partial";
}

/** "inquora Supabase database": the project keeps same-kind backends apart. */
export function defaultLabel(
  t: Pick<TargetRow, "url" | "platform" | "heartbeat_type" | "label" | "projects">,
) {
  const repo = t.projects?.name.split("/").pop();
  const title = targetTitle(t).title;
  return repo ? `${repo} ${title}` : title;
}

/**
 * An outage is a run of at least two failed checks, or one that is still going on: the
 * pinger retries on its next run, so a single failure that recovered was a blip.
 */
function isOutage(o: { ended_at: string | null; failures: number }): boolean {
  return o.ended_at === null || o.failures >= 2;
}

export async function loadStatusPage(
  slug: string,
  viewerId: string | null,
  now = Date.now(),
): Promise<StatusPageView | null> {
  const admin = createAdminClient();
  const { data: page } = await admin
    .from("status_pages")
    .select(
      "id, user_id, title, description, published, show_uptime, show_response_time, show_outages",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!page || (!page.published && page.user_id !== viewerId)) return null;

  const [{ data: itemRows }, { data: noticeRows }] = await Promise.all([
    admin
      .from("status_page_items")
      .select(
        "label, position, targets (id, url, platform, heartbeat_type, label, projects (name))",
      )
      .eq("page_id", page.id)
      .order("position"),
    admin
      .from("status_page_notices")
      .select("id, kind, title, body, created_at, resolved_at")
      .eq("page_id", page.id)
      .gt("created_at", new Date(now - HISTORY_DAYS * DAY_MS).toISOString())
      .order("created_at", { ascending: false }),
  ]);
  const rows = ((itemRows ?? []) as unknown as ItemRow[]).filter(
    (r): r is ItemRow & { targets: TargetRow } => r.targets !== null,
  );
  const ids = rows.map((r) => r.targets.id);

  const [{ data: healthRows }, { data: dailyRows }, { data: outageRows }, { data: windowRows }] =
    ids.length
      ? await Promise.all([
          admin.from("target_health").select("*").in("target_id", ids),
          admin.rpc("backend_daily", { p_targets: ids, p_days: HISTORY_DAYS }),
          admin.rpc("backend_outages", {
            p_targets: ids,
            p_since: new Date(now - HISTORY_DAYS * DAY_MS).toISOString(),
          }),
          admin
            .from("maintenance_windows")
            .select("id, target_id, starts_at, ends_at, note")
            .in("target_id", ids)
            .gt("ends_at", new Date(now - HISTORY_DAYS * DAY_MS).toISOString())
            .order("starts_at", { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  type WindowRow = {
    id: number;
    target_id: string;
    starts_at: string;
    ends_at: string;
    note: string | null;
  };
  const windows = (windowRows ?? []) as WindowRow[];
  const active = new Map(
    windows
      .filter((w) => Date.parse(w.starts_at) <= now && Date.parse(w.ends_at) > now)
      .map((w) => [w.target_id, { ends_at: w.ends_at, note: w.note }]),
  );

  const health = new Map(((healthRows ?? []) as Health[]).map((h) => [h.target_id, h]));
  const daily = new Map<string, Daily[]>();
  for (const d of (dailyRows ?? []) as Daily[])
    daily.set(d.target_id, [...(daily.get(d.target_id) ?? []), d]);

  const labels = new Map<string, string>();
  const items = rows.map((r, position): PageItem => {
    const t = r.targets;
    const days = daily.get(t.id) ?? [];
    const s = statusOf({ ...t, maintenance: active.get(t.id) }, health.get(t.id), now);
    const key = `backend-${position}`;
    const h = health.get(t.id);
    const label = r.label?.trim() || defaultLabel(t);
    labels.set(t.id, label);
    const latencyByDay = new Map(days.map((d) => [d.day, d.avg_latency_ms ?? null]));
    return {
      key,
      label,
      state: s.state,
      lastFailed: Boolean(h?.last_ping_at && h.last_ping_at !== h.last_ok_at),
      cells: dayCells(days, HISTORY_DAYS, now),
      uptime: {
        d7: uptimeOver(days, 7, now),
        d30: uptimeOver(days, 30, now),
        d90: uptimeOver(days, HISTORY_DAYS, now),
      },
      latency: dayCells(days, LATENCY_DAYS, now).map((c) => latencyByDay.get(c.day) ?? null),
      latencyNow: h?.latency_7d ?? null,
    };
  });

  const outages = (
    (outageRows ?? []) as {
      target_id: string;
      started_at: string;
      ended_at: string | null;
      failures: number;
    }[]
  )
    .filter(isOutage)
    .map((o, i) => ({
      key: `outage-${i}`,
      label: labels.get(o.target_id) ?? "A backend",
      startedAt: o.started_at,
      endedAt: o.ended_at,
    }));

  return {
    title: page.title,
    description: page.description,
    published: page.published,
    showUptime: page.show_uptime,
    showResponseTime: page.show_response_time,
    showOutages: page.show_outages,
    items,
    outages,
    maintenance: windows
      .filter((w) => Date.parse(w.starts_at) <= now)
      .map((w) => ({
        key: `maintenance-${w.id}`,
        label: labels.get(w.target_id) ?? "A backend",
        startsAt: w.starts_at,
        endsAt: w.ends_at,
        note: w.note,
      })),
    notices: (noticeRows ?? []) as Notice[],
    overall: overallOf(items),
  };
}
