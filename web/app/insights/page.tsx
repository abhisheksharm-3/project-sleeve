import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/app/components/app-header";
import { isAdmin } from "@/lib/admin";
import { PLATFORM_NAMES } from "@/lib/describe";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tier 3 (spec §8): per-platform reliability, latency and pause behaviour across every
 * user's targets. Admin only, and a 404 for anyone else so its existence does not leak.
 */
type Stat = {
  platform: string;
  targets: number;
  pings: number;
  ok_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  timeouts: number;
  http_errors: number;
  network_errors: number;
  pause_events: number;
  earliest_pause_days: number | null;
  configured_window_days: number | null;
};

const PERIODS = [7, 30, 90];

function windowVerdict(s: Stat): string {
  if (s.configured_window_days === null)
    return "This platform does not pause on a fixed window, so there is nothing to tune.";
  if (s.earliest_pause_days === null)
    return `No pauses seen yet. We assume ${s.configured_window_days} days of silence; a real pause will tell us if that is right.`;
  return s.earliest_pause_days < s.configured_window_days
    ? `A project paused after only ${s.earliest_pause_days} days, sooner than the ${s.configured_window_days} days we assume. Shorten the window.`
    : `The earliest pause came after ${s.earliest_pause_days} days, so the ${s.configured_window_days}-day window holds.`;
}

function seconds(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function failureText(s: Stat): string {
  const parts = [
    s.http_errors && `${s.http_errors} answered with an error`,
    s.timeouts && `${s.timeouts} timed out`,
    s.network_errors && `${s.network_errors} could not connect`,
  ].filter(Boolean);
  return parts.length ? `Of the failed checks, ${parts.join(", ")}.` : "No failed checks.";
}

const SLOTS = Array.from({ length: 20 }, (_, slot) => slot);

/** Twenty windows, lit in proportion to the pass rate. */
function PassWindows({ rate }: { rate: number | null }) {
  const lit = Math.round(((rate ?? 0) / 100) * 20);
  return (
    <span aria-hidden className="flex gap-1">
      {SLOTS.map((slot) => (
        <span
          key={slot}
          className={`h-5 w-3 rounded-[2px] ${slot < lit ? "window-lit" : "window-dark"}`}
        />
      ))}
    </span>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const session = await requireUser();
  const { user } = session;
  if (!isAdmin(user.id)) notFound();

  const requested = Number((await searchParams).days);
  const days = PERIODS.includes(requested) ? requested : 30;
  const { data, error } = await createAdminClient().rpc("platform_stats", { p_days: days });
  const stats = (data ?? []) as Stat[];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-sky to-ink">
      <AppHeader session={session} />
      <main className="w-full flex-1 px-6 pb-16 sm:px-10 lg:px-16">
        <div className="mt-6 flex flex-wrap items-baseline gap-6">
          <h1 className="text-4xl font-semibold">Platform benchmarks</h1>
          <nav
            aria-label="Period"
            className="flex rounded-full border border-line bg-surface p-1 text-sm"
          >
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`/insights?days=${p}`}
                aria-current={p === days ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 transition-colors ${p === days ? "bg-alive font-semibold text-ink" : "text-muted hover:text-text"}`}
              >
                {p} days
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          How each platform behaved across every user&apos;s backends over the last {days} days.
          Only you can see this page. Failed checks include setup mistakes, such as a missing
          keepalive function, so a low rate is a reason to look, not a verdict on the platform.
        </p>

        {error && (
          <p role="alert" className="mt-6 font-mono text-xs text-dead">
            {error.message}
          </p>
        )}

        {stats.length === 0 ? (
          <p className="mt-10 text-[15px] text-muted">No checks ran in this period.</p>
        ) : (
          <ul className="mt-10 grid gap-5 lg:grid-cols-2">
            {stats.map((s) => (
              <li key={s.platform} className="rounded-2xl border border-line bg-surface p-7">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-2xl font-semibold">
                    {PLATFORM_NAMES[s.platform] ?? s.platform}
                  </h2>
                  <span className="text-sm text-muted">
                    {s.targets} {s.targets === 1 ? "backend" : "backends"}, {s.pings} checks
                  </span>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <span
                    className={`text-4xl font-semibold tabular-nums ${s.ok_rate === null ? "text-muted" : s.ok_rate < 80 ? "text-dead" : s.ok_rate < 95 ? "text-warn" : "text-alive"}`}
                  >
                    {s.ok_rate ?? "—"}%
                  </span>
                  <span>
                    <span className="block text-sm text-muted">of checks passed</span>
                    <PassWindows rate={s.ok_rate} />
                  </span>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-4 text-[15px]">
                  <div>
                    <dt className="text-sm text-muted">Usual response</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{seconds(s.p50_ms)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">Slowest 1 in 20</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{seconds(s.p95_ms)}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-[15px] leading-relaxed text-muted">{failureText(s)}</p>
                <p
                  className={`mt-3 text-[15px] leading-relaxed ${s.pause_events ? "text-dead" : "text-text/90"}`}
                >
                  {s.pause_events
                    ? `${s.pause_events} pause${s.pause_events > 1 ? "s" : ""} detected. `
                    : ""}
                  {windowVerdict(s)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
