/** One target as a status line: state, URL, cadence, 14-day strip, uptime and buffer. */
import type { ReactNode } from "react";
import { every } from "@/lib/format";
import { bufferText, type Health, type State, stateOf } from "@/lib/health";
import type { Day } from "@/lib/load-health";

export type RowTarget = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
};

const DOT: Record<State, string> = {
  idle: "bg-muted",
  alive: "bg-alive pulse",
  failing: "bg-dead",
  pause_soon: "bg-warn",
  paused: "bg-dead",
};

const LABEL: Record<State, string> = {
  idle: "never pinged",
  alive: "alive",
  failing: "failing",
  pause_soon: "pause soon",
  paused: "probably paused",
};

const TONE: Record<State, string> = {
  idle: "text-muted",
  alive: "text-muted",
  failing: "text-dead",
  pause_soon: "text-warn",
  paused: "text-dead",
};

/** Fourteen cells, oldest first: green all good, amber some failures, red none good, grey no data. */
function Strip({ days, now }: { days: Day[]; now: number }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const cells = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(now - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    const d = byDay.get(date);
    const tone = !d
      ? "bg-line"
      : d.ok === d.pings
        ? "bg-alive/70"
        : d.ok === 0
          ? "bg-dead/80"
          : "bg-warn/80";
    const title = d ? `${date}: ${d.ok}/${d.pings} ok` : `${date}: no pings`;
    return <span key={date} title={title} className={`h-3 w-1.5 ${tone}`} />;
  });
  return (
    <span
      className="hidden shrink-0 items-center gap-px md:flex"
      role="img"
      aria-label="uptime, last 14 days"
    >
      {cells}
    </span>
  );
}

export function TargetRow({
  target,
  health,
  days,
  now,
  children,
}: {
  target: RowTarget;
  health: Health | undefined;
  days: Day[];
  now: number;
  children?: ReactNode;
}) {
  const state = stateOf(health, now);
  const buffer = bufferText(health, now);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/60 px-4 py-3 last:border-b-0">
      <span className={`size-2 shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{target.url}</span>
      <span className="hidden shrink-0 font-mono text-xs text-muted lg:inline">
        {target.platform} · {target.heartbeat_type} · {every(target.interval_seconds)}
      </span>
      <Strip days={days} now={now} />
      <span className="w-14 shrink-0 text-right font-mono text-xs text-muted">
        {health?.uptime_7d != null ? `${health.uptime_7d}%` : "—"}
      </span>
      <span className={`w-44 shrink-0 text-right font-mono text-xs ${TONE[state]}`}>
        {state === "alive" && buffer
          ? buffer
          : state === "failing"
            ? `${health?.failures_since_ok} failed in a row`
            : state === "pause_soon" && buffer
              ? buffer
              : LABEL[state]}
      </span>
      {children}
    </li>
  );
}
