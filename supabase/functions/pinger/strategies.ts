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
  heartbeat_type: "plain" | "db_query" | "db_write" | "synthetic";
  secret: string | null;
  platform: string;
  /** The platform's own id for the target, e.g. an Appwrite project id. */
  platform_ref: string | null;
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

/**
 * Platforms that cold-start hold the request while the service wakes: a sleeping Space
 * answered 200 after 16.3s when measured, and Render quotes about a minute. Cutting those
 * off at 15s would log a successful wake as a failure. 45s stays under pg_net's 55s
 * dispatch timeout and far under the reaper's 300s.
 */
const COLD_START_TIMEOUT_MS: Record<string, number> = { huggingface: 45_000, render: 45_000 };

export function deadlineFor(platform: string): number {
  return COLD_START_TIMEOUT_MS[platform] ?? DEFAULT_TIMEOUT_MS;
}

const MAX_ERROR_CHARS = 300;

/** ping_log.error is an error taxonomy, not a transcript (spec §8). */
function describeError(e: unknown, timeoutMs: number): string {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return `timeout after ${timeoutMs}ms`;
  }
  const message = e instanceof Error ? e.message : String(e);
  return message.slice(0, MAX_ERROR_CHARS);
}

/**
 * Appwrite's inactivity check ignores reads, so its heartbeat upserts one row, always the
 * same row, holding only a timestamp. The key travels as X-Appwrite-Key and never as a
 * bearer token. Returns null when a write target has no project id to address.
 */
function appwriteWrite(job: Job): RequestInit | null {
  if (!job.platform_ref || !job.secret) return null;
  return {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-appwrite-project": job.platform_ref,
      "x-appwrite-key": job.secret,
    },
    body: JSON.stringify({ data: { beat: new Date().toISOString() } }),
  };
}

/**
 * Supabase's gateway authenticates on apikey and answers a bearer-only request with 401,
 * so its key is sent both ways. db_query tells a user's own route to run a real query.
 */
function readRequest(job: Job): RequestInit {
  const headers = new Headers();
  if (job.secret) {
    headers.set("authorization", `Bearer ${job.secret}`);
    if (job.platform === "supabase") headers.set("apikey", job.secret);
  }
  if (job.heartbeat_type === "db_query") headers.set("x-sleeve-mode", "db_query");
  return { method: job.method, headers };
}

function buildRequest(job: Job): RequestInit | null {
  return job.heartbeat_type === "db_write" ? appwriteWrite(job) : readRequest(job);
}

export async function runHeartbeat(job: Job, opts: HeartbeatOptions = {}): Promise<PingResult> {
  const { fetchFn = fetch, now = () => performance.now() } = opts;
  const timeoutMs = opts.timeoutMs ?? deadlineFor(job.platform);

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

  const request = buildRequest(job);
  if (!request) {
    return { ok: false, status_code: null, latency_ms: null, error: "missing platform_ref" };
  }

  const start = now();
  try {
    const res = await fetchFn(job.url, { ...request, signal: AbortSignal.timeout(timeoutMs) });
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
