import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { detectPause, type Job, type PingResult, runHeartbeat } from "./strategies.ts";

export type CycleOptions = {
  batchSize?: number;
  jitterSeconds?: number;
  timeoutMs?: number;
};

export type CycleResult = {
  /** jobs claimed and run this cycle */
  processed: number;
  /** jobs whose outcome could not be written; the ping itself still happened */
  failed: number;
};

/**
 * Write what a ping told us. Status, latency and error type only — never the body,
 * never the target's secret (spec §8).
 */
async function recordOutcome(db: SupabaseClient, job: Job, result: PingResult): Promise<void> {
  const { error: logError } = await db.from("ping_log").insert({
    target_id: job.target_id,
    ok: result.ok,
    status_code: result.status_code,
    latency_ms: result.latency_ms,
    error: result.error,
  });
  if (logError) throw new Error(`ping_log insert failed: ${logError.message}`);

  const pause = detectPause(job, result);
  if (!pause.paused) return;

  // Tier-1 ground truth: the platform paused this project despite our pings. How much
  // buffer we had when it happened is the number that tunes every pause window later.
  const { data: lastOk } = await db.from("ping_log")
    .select("ran_at")
    .eq("target_id", job.target_id)
    .eq("ok", true)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastOkAt = lastOk?.ran_at ?? null;
  const { error: pauseError } = await db.from("pause_events").insert({
    target_id: job.target_id,
    platform: job.platform,
    signal: pause.signal,
    last_ok_ping_at: lastOkAt,
    days_since_last_ok: lastOkAt
      ? (Date.now() - new Date(lastOkAt).getTime()) / 86_400_000
      : null,
  });
  if (pauseError) throw new Error(`pause_events insert failed: ${pauseError.message}`);
}

/**
 * Run one job to completion and hand it back to the queue no matter what.
 *
 * The reschedule sits in a finally: a job that was claimed must always return to 'idle',
 * or it stays invisible to the scheduler until the reaper notices five minutes later.
 * Losing a log row is cheap; losing a target's whole schedule is not.
 */
async function processJob(db: SupabaseClient, job: Job, opts: CycleOptions): Promise<void> {
  const result = await runHeartbeat(job, { timeoutMs: opts.timeoutMs }); // never throws
  try {
    await recordOutcome(db, job, result);
  } finally {
    const { error } = await db.rpc("reschedule_job", {
      p_job_id: job.job_id,
      p_ok: result.ok,
      p_jitter_seconds: opts.jitterSeconds ?? 0,
    });
    // job id only: never log a target's url or secret
    if (error) console.error(`reschedule failed for job ${job.job_id}: ${error.message}`);
  }
}

/**
 * One turn of the engine: claim a batch of due jobs, ping them all, record and reschedule.
 *
 * Jobs run concurrently and are settled independently, so one target's failure cannot
 * strand its siblings mid-cycle.
 */
export async function runCycle(db: SupabaseClient, opts: CycleOptions = {}): Promise<CycleResult> {
  const { data: claimed, error } = await db.rpc("claim_due_jobs", {
    batch_size: opts.batchSize ?? 50,
  });
  if (error) throw new Error(`claim_due_jobs failed: ${error.message}`);

  const jobs = (claimed ?? []) as Job[];
  const outcomes = await Promise.allSettled(jobs.map((job) => processJob(db, job, opts)));

  const failed = outcomes.filter((o) => o.status === "rejected");
  for (const f of failed) console.error(`job outcome not recorded: ${f.reason}`);

  return { processed: jobs.length, failed: failed.length };
}
