/**
 * A published status page: overall state, owner notices, each backend's 90 days as a row of
 * windows, and the outage history. The owner also sees it before publishing, as a draft.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayWindows } from "@/app/components/day-windows";
import { Sparkline } from "@/app/components/sparkline";
import { Stat } from "@/app/components/stat";
import type { State } from "@/lib/health";
import {
  HISTORY_DAYS,
  loadStatusPage,
  type Notice,
  type Overall,
  type StatusPageView,
} from "@/lib/status-page";
import { OVERALL_WORDS } from "@/lib/status-words";
import { createClient } from "@/lib/supabase/server";
import { span } from "@/lib/uptime";

async function load(slug: string) {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  return loadStatusPage(slug, user?.id ?? null);
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return { title: "Status page not found" };
  return {
    title: `${page.title} status`,
    description: page.description ?? `Live status and uptime for ${page.title}.`,
    robots: page.published ? undefined : { index: false },
  };
}

const OVERALL_LOOK: Record<Overall, { tone: string; window: string }> = {
  up: { tone: "text-alive", window: "window-lit" },
  degraded: { tone: "text-warn", window: "window-lit flicker" },
  partial: { tone: "text-dead", window: "bg-dead flicker" },
  down: { tone: "text-dead", window: "bg-dead" },
  empty: { tone: "text-muted", window: "window-dark" },
};

const STATE_WORD: Record<State, { text: string; tone: string }> = {
  alive: { text: "Up", tone: "text-alive" },
  pause_soon: { text: "Up", tone: "text-alive" },
  idle: { text: "Waiting for its first check", tone: "text-muted" },
  failing: { text: "Down", tone: "text-dead" },
  paused: { text: "Paused", tone: "text-dead" },
};

const DOWN_WORDS: State[] = ["failing", "paused"];

const NOTICE_TONE: Record<Notice["kind"], { word: string; border: string; text: string }> = {
  incident: { word: "Incident", border: "border-dead/50", text: "text-dead" },
  maintenance: { word: "Maintenance", border: "border-warn/50", text: "text-warn" },
  notice: { word: "Notice", border: "border-line", text: "text-muted" },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function percent(v: number | null): string {
  return v === null ? "No data" : `${v}%`;
}

function latencyText(ms: number | null): string | null {
  if (ms === null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function NoticeCard({ notice }: { notice: Notice }) {
  const tone = NOTICE_TONE[notice.kind];
  return (
    <article className={`rounded-2xl border ${tone.border} bg-surface p-5`}>
      <p className={`text-sm font-medium ${tone.text}`}>
        {tone.word}, posted {when(notice.created_at)}
      </p>
      <h3 className="mt-1 text-lg font-semibold">{notice.title}</h3>
      {notice.body && (
        <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-muted">
          {notice.body}
        </p>
      )}
    </article>
  );
}

type HistoryEntry = { key: string; at: string; title: string; detail: string; tone: string };

function history(page: StatusPageView, now: number): HistoryEntry[] {
  const outages: HistoryEntry[] = page.showOutages
    ? page.outages.map((o) => ({
        key: o.key,
        at: o.startedAt,
        title: `${o.label} was down`,
        detail: o.endedAt
          ? `For ${span(Date.parse(o.endedAt) - Date.parse(o.startedAt))}, from ${when(o.startedAt)}.`
          : `Since ${when(o.startedAt)}, ${span(now - Date.parse(o.startedAt))} so far.`,
        tone: o.endedAt ? "text-muted" : "text-dead",
      }))
    : [];
  const resolved: HistoryEntry[] = page.notices
    .filter((n) => n.resolved_at)
    .map((n) => ({
      key: `notice-${n.id}`,
      at: n.created_at,
      title: n.title,
      detail: `${NOTICE_TONE[n.kind].word}, resolved ${when(n.resolved_at ?? n.created_at)}.`,
      tone: "text-muted",
    }));
  return [...outages, ...resolved].sort((a, b) => b.at.localeCompare(a.at));
}

function mean(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (!known.length) return null;
  return Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10;
}

export default async function PublicStatusPage({ params }: PageProps<"/s/[slug]">) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const now = Date.now();
  const overall = { ...OVERALL_LOOK[page.overall], text: OVERALL_WORDS[page.overall].text };
  const open = page.notices.filter((n) => !n.resolved_at);
  const past = history(page, now);
  const uptime90 = mean(page.items.map((i) => i.uptime.d90));
  const uptime30 = mean(page.items.map((i) => i.uptime.d30));
  const latency = mean(page.items.map((i) => i.latencyNow));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className={`h-3.5 w-2.5 shrink-0 rounded-[2px] ${overall.window}`} />
            <span className="text-[15px] font-semibold">Status</span>
          </span>
          <span className="shrink-0 text-sm text-muted">
            Updated {when(new Date(now).toISOString())}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-12 pb-16 sm:px-6">
        {!page.published && (
          <p className="mb-8 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-warn">
            Draft. Only you can see this page until you publish it.
          </p>
        )}
        <h1 className="text-4xl font-semibold sm:text-5xl">{page.title}</h1>
        {page.description && (
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">{page.description}</p>
        )}
        <p className={`mt-8 flex items-center gap-3 text-2xl font-semibold ${overall.tone}`}>
          <span aria-hidden className={`h-7 w-5 shrink-0 rounded-[3px] ${overall.window}`} />
          {overall.text}
        </p>

        {page.items.length > 0 && (page.showUptime || page.showResponseTime) && (
          <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 border-y border-line py-6 sm:grid-cols-4">
            {page.showUptime && (
              <>
                <Stat label={`Uptime, ${HISTORY_DAYS} days`} value={percent(uptime90)} />
                <Stat label="Uptime, 30 days" value={percent(uptime30)} />
              </>
            )}
            {page.showResponseTime && (
              <Stat
                label="Average response"
                value={latencyText(latency === null ? null : Math.round(latency)) ?? "—"}
              />
            )}
            {page.showOutages && (
              <Stat
                label={`Outages, ${HISTORY_DAYS} days`}
                value={String(page.outages.length)}
                note={page.outages.some((o) => !o.endedAt) ? "one is ongoing" : undefined}
              />
            )}
          </dl>
        )}

        {open.length > 0 && (
          <section aria-label="Current notices" className="mt-10 space-y-4">
            {open.map((n) => (
              <NoticeCard key={n.id} notice={n} />
            ))}
          </section>
        )}

        {page.items.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-semibold">Backends</h2>
            <div
              aria-hidden
              className="mt-6 flex justify-between border-b border-line pb-2 text-xs text-muted"
            >
              <span className="max-sm:hidden">{HISTORY_DAYS} days ago</span>
              <span className="sm:hidden">30 days ago</span>
              <span>Today</span>
            </div>
            <ul>
              {page.items.map((item) => {
                const word =
                  item.lastFailed && !DOWN_WORDS.includes(item.state)
                    ? { text: "Last check failed", tone: "text-warn" }
                    : STATE_WORD[item.state];
                const ms = latencyText(item.latencyNow);
                return (
                  <li key={item.key} className="border-b border-line py-4">
                    <div className="flex items-baseline gap-4">
                      <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                        {item.label}
                      </h3>
                      {page.showUptime && (
                        <span className="text-sm tabular-nums">{percent(item.uptime.d90)}</span>
                      )}
                      <span
                        className={`shrink-0 text-right text-sm font-medium sm:w-28 ${word.tone}`}
                      >
                        {word.text}
                      </span>
                    </div>
                    <div className="mt-3">
                      <DayWindows cells={item.cells} mobileDays={30} className="h-8" />
                    </div>
                    {page.showResponseTime && ms && (
                      <div className="mt-3 flex items-center gap-4 text-sm text-muted">
                        <span className="shrink-0">
                          Responds in <span className="text-text tabular-nums">{ms}</span>
                        </span>
                        <span className="w-full max-w-40">
                          <Sparkline
                            values={item.latency}
                            label={`Daily response time for ${item.label} over 30 days`}
                          />
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(page.showOutages || page.notices.some((n) => n.resolved_at)) && (
          <section className="mt-14">
            <h2 className="text-xl font-semibold">History</h2>
            {past.length === 0 ? (
              <p className="mt-3 text-[15px] text-muted">
                No outages in the last {HISTORY_DAYS} days.
              </p>
            ) : (
              <ol className="mt-5 space-y-5 border-l border-line pl-5">
                {past.map((e) => (
                  <li key={e.key}>
                    <p className="text-[15px] font-semibold">{e.title}</p>
                    <p className={`mt-0.5 text-sm ${e.tone}`}>{e.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-4xl px-4 py-6 text-sm text-muted sm:px-6">
          Kept awake by{" "}
          <Link
            href="/"
            className="text-text underline decoration-line underline-offset-4 hover:text-alive"
          >
            ProjectSleeve
          </Link>
        </p>
      </footer>
    </div>
  );
}
