/** Day-by-day uptime: the windows on the dashboard's buildings and the bars on status pages. */

export type DailyChecks = {
  day: string;
  pings: number;
  ok: number;
  avg_latency_ms?: number | null;
};

/** up: every check passed. partial: some failed. down: all failed. none: nothing ran. */
export type DayState = "up" | "partial" | "down" | "none";

export type DayCell = { day: string; state: DayState; uptime: number | null };

const DAY_MS = 86_400_000;

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayState(d: Pick<DailyChecks, "pings" | "ok"> | undefined): DayState {
  if (!d?.pings) return "none";
  if (d.ok === d.pings) return "up";
  return d.ok === 0 ? "down" : "partial";
}

/** The last `count` UTC days ending today, oldest first, with days that ran nothing filled in. */
export function dayCells(rows: DailyChecks[], count: number, now = Date.now()): DayCell[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: count }, (_, i) => {
    const day = utcDay(now - (count - 1 - i) * DAY_MS);
    const r = byDay.get(day);
    return {
      day,
      state: dayState(r),
      uptime: r?.pings ? Math.round((r.ok / r.pings) * 1000) / 10 : null,
    };
  });
}

/** Percent of checks passed over the last `days` days, to one decimal, or null if none ran. */
export function uptimeOver(rows: DailyChecks[], days: number, now = Date.now()): number | null {
  const from = utcDay(now - (days - 1) * DAY_MS);
  let pings = 0;
  let ok = 0;
  for (const r of rows) {
    if (r.day < from) continue;
    pings += r.pings;
    ok += r.ok;
  }
  return pings ? Math.round((ok / pings) * 1000) / 10 : null;
}

/** Outage length in words: "4m", "2h 5m", "3d 1h". */
export function span(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return hours % 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${Math.floor(hours / 24)}d`;
}
