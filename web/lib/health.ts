/** One reading of a target's health, shared by the dashboard and the project page. */
import { ago } from "./format.ts";

export type Health = {
  target_id: string;
  pause_window_seconds: number | null;
  last_ping_at: string | null;
  last_ok_at: string | null;
  failures_since_ok: number;
  pings_7d: number;
  uptime_7d: number | null;
  pause_at: string | null;
};

export type State = "idle" | "alive" | "failing" | "pause_soon" | "paused";

const FAILING_STREAK = 3;
const PAUSE_SOON_MS = 48 * 3_600_000;
const DAY_S = 86_400;

/**
 * Worst condition wins: a project past its pause deadline is paused even if the latest ping
 * failed for another reason. Mirrors alert_conditions in SQL, so the badge and the alert agree.
 */
export function stateOf(h: Health | undefined, now = Date.now()): State {
  if (!h?.last_ping_at) return "idle";
  const pauseAt = h.pause_at ? Date.parse(h.pause_at) : null;
  if (pauseAt !== null && pauseAt <= now) return "paused";
  if (h.failures_since_ok >= FAILING_STREAK) return "failing";
  if (pauseAt !== null && (h.pause_window_seconds ?? 0) >= DAY_S && pauseAt - now < PAUSE_SOON_MS)
    return "pause_soon";
  return "alive";
}

/** "5d 22h before pause", or null where the platform never pauses. */
export function bufferText(h: Health | undefined, now = Date.now()): string | null {
  if (!h?.pause_at) return null;
  const ms = Date.parse(h.pause_at) - now;
  if (ms <= 0) return `pause window passed ${ago(h.pause_at, now)}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.floor(ms / 60_000)}m before pause`;
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h before pause` : `${hours}h before pause`;
}

/** Checks passed across targets, weighted by how many each ran, so a new target cannot skew it. */
export function passRate(rows: Health[]): number | null {
  const pings = rows.reduce((n, r) => n + r.pings_7d, 0);
  if (!pings) return null;
  const ok = rows.reduce((n, r) => n + ((r.uptime_7d ?? 0) / 100) * r.pings_7d, 0);
  return Math.round((ok / pings) * 1000) / 10;
}
