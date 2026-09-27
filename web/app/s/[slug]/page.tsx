/**
 * A published status page: overall state, owner notices, each backend's 90 days as a row of
 * windows, and the outage history. The owner also sees it before publishing, as a draft.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DayWindows } from "@/app/components/day-windows";
import { Sparkline } from "@/app/components/sparkline";
import type { State } from "@/lib/health";
import {
  HISTORY_DAYS,
  loadStatusPage,
  type Notice,
  type Overall,
  type StatusPageView,
} from "@/lib/status-page";
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

const OVERALL: Record<Overall, { text: string; tone: string; window: string }> = {
  up: { text: "Everything is up.", tone: "text-alive", window: "window-lit" },
  degraded: {
    text: "Mostly up. A backend failed its latest check.",
    tone: "text-warn",
    window: "window-lit flicker",
  },
  partial: { text: "Some of this is down.", tone: "text-dead", window: "bg-dead flicker" },
  down: { text: "Everything here is down.", tone: "text-dead", window: "bg-dead" },
  empty: { text: "Nothing is on this page yet.", tone: "text-muted", window: "window-dark" },
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

export default async function PublicStatusPage({ params }: PageProps<"/s/[slug]">) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const now = Date.now();
  const overall = OVERALL[page.overall];
  const open = page.notices.filter((n) => !n.resolved_at);
  const past = history(page, now);

  return (
    <main className="flex min-h-full flex-1 flex-col px-4 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-3xl flex-1">
        {!page.published && (
          <p className="mb-8 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-warn">
            Draft. Only you can see this page until you publish it.
          </p>
        )}
        <h1 className="text-4xl font-semibold sm:text-5xl">{page.title}</h1>
        {page.description && (
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">{page.description}</p>
        )}

        <section className="mt-10 flex items-center gap-5 rounded-2xl border border-line bg-surface p-6">
          <span aria-hidden className={`h-14 w-10 shrink-0 rounded-[5px] ${overall.window}`} />
          <div>
            <p className={`text-2xl font-semibold ${overall.tone}`}>{overall.text}</p>
            <p className="mt-1 text-sm text-muted">Checked {when(new Date(now).toISOString())}</p>
          </div>
        </section>

        {open.length > 0 && (
          <section aria-label="Current notices" className="mt-6 space-y-4">
            {open.map((n) => (
              <NoticeCard key={n.id} notice={n} />
            ))}
          </section>
        )}

        {page.items.length > 0 && (
          <section className="mt-12">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold">Backends</h2>
              <p className="text-sm text-muted">
                <span className="max-sm:hidden">Last {HISTORY_DAYS} days</span>
                <span className="sm:hidden">Last 30 days</span>
              </p>
            </div>
            <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
              {page.items.map((item) => {
                const word =
                  item.lastFailed && !DOWN_WORDS.includes(item.state)
                    ? { text: "Last check failed", tone: "text-warn" }
                    : STATE_WORD[item.state];
                const latency = latencyText(item.latencyNow);
                return (
                  <li key={item.key} className="px-5 py-4 sm:px-6">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="truncate text-[15px] font-semibold">{item.label}</h3>
                      <p className={`shrink-0 text-sm font-medium ${word.tone}`}>{word.text}</p>
                    </div>
                    <div className="mt-2.5">
                      <DayWindows cells={item.cells} mobileDays={30} className="h-6" />
                    </div>
                    {(page.showUptime || (page.showResponseTime && latency)) && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
                        {page.showUptime &&
                          (
                            [
                              ["7d", item.uptime.d7],
                              ["30d", item.uptime.d30],
                              [`${HISTORY_DAYS}d`, item.uptime.d90],
                            ] as const
                          ).map(([label, value]) => (
                            <span key={label} className={label === "30d" ? "max-sm:hidden" : ""}>
                              <span className="font-semibold text-text tabular-nums">
                                {percent(value)}
                              </span>{" "}
                              over {label.replace("d", " days")}
                            </span>
                          ))}
                        {page.showResponseTime && latency && (
                          <span className="flex min-w-40 flex-1 items-center gap-3 sm:justify-end">
                            <span className="shrink-0">
                              Responds in{" "}
                              <span className="font-semibold text-text tabular-nums">
                                {latency}
                              </span>
                            </span>
                            <span className="w-full max-w-48">
                              <Sparkline
                                values={item.latency}
                                label={`Daily response time for ${item.label} over 30 days`}
                              />
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(page.showOutages || page.notices.length > 0) && (
          <section className="mt-12">
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
      </div>
      <p className="mx-auto mt-16 w-full max-w-3xl text-sm text-muted">
        Kept awake by{" "}
        <Link href="/" className="underline decoration-line underline-offset-4 hover:text-text">
          ProjectSleeve
        </Link>
        .
      </p>
    </main>
  );
}
