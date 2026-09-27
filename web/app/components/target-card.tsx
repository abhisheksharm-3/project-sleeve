/** One backend we keep awake: its window, what it is, and one sentence on how it is doing. */
import type { ReactNode } from "react";
import { caveat, methodText, statusOf, targetTitle } from "@/lib/describe";
import { every } from "@/lib/format";
import type { Health } from "@/lib/health";
import type { Day } from "@/lib/load-health";
import { restoreUrl } from "@/lib/probe";
import { NightStrip } from "./night-strip";
import { Window } from "./window";

export type CardTarget = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
  platform_ref?: string | null;
  method?: string;
};

const SENTENCE_TONE = {
  idle: "text-muted",
  alive: "text-text",
  pause_soon: "text-warn",
  failing: "text-dead",
  paused: "text-dead",
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
}: {
  target: CardTarget;
  health: Health | undefined;
  days: Day[];
  now: number;
  children?: ReactNode;
}) {
  const { title, detail } = targetTitle(target);
  const status = statusOf(target, health, now);
  const warning = caveat(target);
  const restore = restoreUrl({
    platform: target.platform,
    url: target.url,
    heartbeat_type: target.heartbeat_type,
    method: target.method ?? "GET",
    secret: null,
    platform_ref: target.platform_ref ?? null,
  });
  return (
    <li className="flex gap-5 rounded-2xl border border-line bg-surface p-6">
      <div className="pt-1">
        <Window state={status.state} size="lg" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <span className="truncate text-sm text-muted">{detail}</span>
          {children && <span className="ml-auto flex items-center gap-2">{children}</span>}
        </div>
        <p className={`mt-2 text-[15px] leading-relaxed ${SENTENCE_TONE[status.state]}`}>
          <span className="font-semibold">{status.headline}.</span> {status.sentence}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted">
          <span>
            {capitalise(methodText(target))}, {every(target.interval_seconds)}.
          </span>
          <span className="flex items-center gap-3">
            <NightStrip days={days} now={now} />
            <span>
              {health?.uptime_7d != null
                ? `${health.uptime_7d}% of checks passed this week`
                : "No checks yet"}
            </span>
          </span>
        </div>
        {warning && <p className="mt-3 text-sm text-warn">{warning}</p>}
        {status.state === "paused" && restore && (
          <a
            href={restore}
            className="mt-3 inline-block text-sm font-semibold text-dead underline underline-offset-4"
          >
            Open it on the platform to restore it
          </a>
        )}
      </div>
    </li>
  );
}
