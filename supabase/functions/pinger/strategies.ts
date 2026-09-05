/**
 * Heartbeat strategies: how ProjectSleeve actually touches a target.
 *
 * `plain` is what every generic uptime pinger does — a bare request that a platform's
 * inactivity clock may ignore entirely. `db_query` is the moat: it hits a route the user
 * dropped into their own app, flagged so that route runs a real query and resets the
 * clock that matters. `synthetic` is defined but deferred (spec §2, §5).
 *
 * Pure by design: `fetch`, the clock and the deadline are all injectable, so the whole
 * decision surface is unit-testable without a network.
 */

export type Job = {
  job_id: string;
  target_id: string;
  url: string;
  method: string;
  heartbeat_type: "plain" | "db_query" | "synthetic";
  secret: string | null;
  platform: string;
};

export type PingResult = {
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
};

export type HeartbeatOptions = {
  fetchFn?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

/**
 * Must stay well under reap_stuck_jobs()'s 300s claim age, or a hung target would be
 * reaped and re-claimed while its first ping is still in flight.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

const MAX_ERROR_CHARS = 300;

/** ping_log.error is an error taxonomy, not a transcript (spec §8). */
function describeError(e: unknown, timeoutMs: number): string {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return `timeout after ${timeoutMs}ms`;
  }
  const message = e instanceof Error ? e.message : String(e);
  return message.slice(0, MAX_ERROR_CHARS);
}

export async function runHeartbeat(job: Job, opts: HeartbeatOptions = {}): Promise<PingResult> {
  const { fetchFn = fetch, now = () => performance.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  if (job.heartbeat_type === "synthetic") {
    return { ok: false, status_code: null, latency_ms: null, error: "NotImplemented: synthetic" };
  }

  // Trust boundary: the URL is user-supplied. Anything but http(s) is never a live
  // backend, and schemes like file: would read the runtime's own host.
  // Blocking private and link-local addresses belongs at target-creation time, where a
  // rejection can be shown to the user; the hub plan adds it.
  let scheme: string;
  try {
    scheme = new URL(job.url).protocol;
  } catch {
    return { ok: false, status_code: null, latency_ms: null, error: "invalid url" };
  }
  if (scheme !== "http:" && scheme !== "https:") {
    return {
      ok: false,
      status_code: null,
      latency_ms: null,
      error: `unsupported scheme ${scheme}`,
    };
  }

  const headers = new Headers();
  if (job.secret) headers.set("authorization", `Bearer ${job.secret}`);
  // tells the user's snippet to run a real query rather than return a static 200
  if (job.heartbeat_type === "db_query") headers.set("x-sleeve-mode", "db_query");

  const start = now();
  try {
    const res = await fetchFn(job.url, {
      method: job.method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latency_ms = Math.round(now() - start);
    // Data minimization: we read the status line and nothing else. Cancelling the body
    // releases the connection without pulling the user's data into memory.
    await res.body?.cancel().catch(() => {});
    return {
      ok: res.status >= 200 && res.status < 400,
      status_code: res.status,
      latency_ms,
      error: null,
    };
  } catch (e) {
    return { ok: false, status_code: null, latency_ms: null, error: describeError(e, timeoutMs) };
  }
}

/**
 * Did this response mean "the platform paused the project", as opposed to "the project is
 * broken"? This is the Tier-1 feedback loop (spec §8): the ground truth for whether
 * keep-alive actually works, and the signal that a `plain` target should move to
 * `db_query`.
 *
 * Status codes only — never the body, per data minimization. A platform absent from this
 * table reports failures but never pauses: a wrong pause signature would poison the one
 * dataset that measures the product. Signatures get calibrated from real pause_events
 * before a platform is added.
 */
const PAUSE_STATUS: Record<string, number[]> = {
  supabase: [540, 503],
  render: [503],
};

export function detectPause(
  job: Job,
  result: PingResult,
): { paused: boolean; signal: string | null } {
  // no status line means we cannot tell a paused project from broken DNS
  if (result.ok || result.status_code === null) return { paused: false, signal: null };

  const codes = PAUSE_STATUS[job.platform] ?? [];
  if (codes.includes(result.status_code)) {
    return { paused: true, signal: `${job.platform}:status_${result.status_code}` };
  }
  return { paused: false, signal: null };
}
