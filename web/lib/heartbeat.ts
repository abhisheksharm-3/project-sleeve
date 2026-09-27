/** Inbound heartbeats: the periods a job may promise, and when a missing ping counts. */

export const HEARTBEAT_PERIODS = [
  { seconds: 300, label: "every 5 minutes" },
  { seconds: 900, label: "every 15 minutes" },
  { seconds: 3_600, label: "every hour" },
  { seconds: 21_600, label: "every 6 hours" },
  { seconds: 43_200, label: "every 12 hours" },
  { seconds: 86_400, label: "every day" },
  { seconds: 604_800, label: "every week" },
] as const;

/** A tenth of the period, never under five minutes; mirrors mark_missed_heartbeats(). */
export function graceSeconds(period: number): number {
  return Math.max(300, Math.floor(period / 10));
}

export const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

/** At most one recorded ping per target in this long, so a job stuck in a loop cannot flood. */
export const MIN_PING_GAP_MS = 30_000;
