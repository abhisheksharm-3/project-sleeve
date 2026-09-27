/** One backend on its project page: state, what it is, 30 days of checks, and how it is run. */
import type { ReactNode } from "react";
import { caveat, type Maintenance, methodText, statusOf, targetTitle } from "@/lib/describe";
import { every } from "@/lib/format";
import { bufferText, type Health } from "@/lib/health";
import type { Day } from "@/lib/load-health";
import { restoreUrl } from "@/lib/probe";
import { dayCells, uptimeOver } from "@/lib/uptime";
import { DayWindows } from "./day-windows";
import { latencyText } from "./stat";
import { WindowState } from "./window";

export type CardTarget = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
  platform_ref?: string | null;
  method?: string;
  auto_restore?: boolean;
  maintenance?: Maintenance | null;
  label?: string | null;
};

const DAYS = 30;

const SENTENCE_TONE = {
  idle: "text-muted",
  alive: "text-muted",
  pause_soon: "text-warn",
  failing: "text-dead",
  paused: "text-dead",
  maintenance: "text-warn",
};

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TargetCard({
  target,
  health,
  days,
  now,
  children,
  autoRestoreControl,
}: {
  target: CardTarget;
  health: Health | undefined;
  days: Day[];
  now: number;
  children?: ReactNode;
  autoRestoreControl?: ReactNode;
}) {
  const { title, detail } = targetTitle(target);
  const status = statusOf(target, health, now);
  const warning = caveat(target);
  const uptime = uptimeOver(days, DAYS, now);
  const restore = restoreUrl({
    platform: target.platform,
    url: target.url,
    heartbeat_type: target.heartbeat_type,
    method: target.method ?? "GET",
    secret: null,
    platform_ref: target.platform_ref ?? null,
  });
  const facts = [
    [
      "How",
      target.heartbeat_type === "inbound"
        ? `Expects a ping ${every(target.interval_seconds)}`
        : `${capitalise(methodText(target))}, ${every(target.interval_seconds)}`,
    ],
    [`Passed, ${DAYS} days`, uptime === null ? "No checks yet" : `${uptime}%`],
    ["Responds in", latencyText(health?.latency_7d)],
    [
      "Pause buffer",
      target.heartbeat_type === "inbound"
        ? "Does not pause"
        : (bufferText(health, now)?.replace(" before pause", "") ?? "Never pauses"),
    ],
  ] as const;
  return (
    <li className="border-b border-line py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="min-w-0 truncate text-sm text-muted">{detail}</span>
        <span className="ml-auto flex items-center gap-4">
          <WindowState state={status.state} label={status.headline} />
          {children}
        </span>
      </div>
      <p className={`mt-1.5 text-[15px] ${SENTENCE_TONE[status.state]}`}>{status.sentence}</p>
      <div className="mt-4">
        <DayWindows cells={dayCells(days, DAYS, now)} mobileDays={14} className="h-6" />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="mt-0.5 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {target.auto_restore && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>
            <span className="font-medium text-alive">Auto-restore on.</span> If Supabase pauses it
            anyway, we restore it and tell you.
          </span>
          {autoRestoreControl}
        </p>
      )}
      {target.heartbeat_type === "inbound" && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted">
            Add this as the last step of the job. It works with any HTTP method; add{" "}
            <span className="font-mono text-[13px] text-text">/fail</span> to report a failed run.
          </p>
          <pre className="overflow-x-auto rounded-xl border border-line bg-ink p-3 font-mono text-[13px] select-all">
            curl -fsS --retry 3 {target.url}
          </pre>
        </div>
      )}
      {warning && <p className="mt-3 text-sm text-warn">{warning}</p>}
      {status.state === "paused" && restore && (
        <a
          href={restore}
          className="mt-3 inline-block text-sm font-semibold text-dead underline underline-offset-4"
        >
          Open it on the platform to restore it
        </a>
      )}
    </li>
  );
}
