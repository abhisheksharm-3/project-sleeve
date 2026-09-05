import { assert, assertEquals, assertExists } from "@std/assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient, resetEngineTables } from "../helpers/db.ts";
import { startEchoServer } from "../helpers/echo_server.ts";
import { runCycle } from "../../supabase/functions/pinger/engine.ts";

/**
 * Insert a target plus a job that is already due.
 * Upsert (not insert) the job: once the sync trigger of Task 5 exists the trigger has
 * already created one, so a plain insert would hit unique(target_id). Upserting forces
 * next_run_at into the past either way.
 */
async function seedTarget(db: SupabaseClient, over: Record<string, unknown> = {}) {
  const { data, error } = await db.from("targets").insert({
    platform: "custom",
    url: "http://example.test/ping",
    heartbeat_type: "plain",
    interval_seconds: 60,
    ...over,
  }).select().single();
  if (error) throw error;

  const { error: jErr } = await db.from("jobs").upsert({
    target_id: data.id,
    next_run_at: new Date(Date.now() - 1000).toISOString(),
    min_interval_seconds: data.interval_seconds,
  }, { onConflict: "target_id" });
  if (jErr) throw jErr;
  return data;
}

Deno.test("schema: engine tables exist and are queryable", async () => {
  const db = getServiceClient();
  for (const table of ["targets", "jobs", "ping_log", "pause_events"]) {
    const { error } = await db.from(table).select("*").limit(0);
    assertEquals(error, null, `table ${table} should be queryable`);
  }
});

Deno.test("claim_due_jobs: claims only due idle jobs and flips them to claimed", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db);

  const { data: claimed, error } = await db.rpc("claim_due_jobs", { batch_size: 50 });
  assertEquals(error, null);
  assertEquals(claimed.length, 1);
  assertEquals(claimed[0].target_id, t.id);
  assertEquals(claimed[0].url, "http://example.test/ping");
  assertEquals(claimed[0].platform, "custom");

  const { data: job } = await db.from("jobs").select("status").eq("target_id", t.id).single();
  assertExists(job);
  assertEquals(job.status, "claimed");

  // second claim returns nothing — already claimed, not double-handed-out
  const { data: again } = await db.rpc("claim_due_jobs", { batch_size: 50 });
  assertEquals(again.length, 0);
});

Deno.test("claim_due_jobs: ignores not-yet-due jobs", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db);
  await db.from("jobs")
    .update({ next_run_at: new Date(Date.now() + 3600_000).toISOString() })
    .eq("target_id", t.id);

  const { data: claimed } = await db.rpc("claim_due_jobs", { batch_size: 50 });
  assertEquals(claimed.length, 0);
});

Deno.test("claim_due_jobs: batch_size caps the batch and leaves the rest claimable", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  await seedTarget(db, { url: "http://a.test/ping" });
  await seedTarget(db, { url: "http://b.test/ping" });
  await seedTarget(db, { url: "http://c.test/ping" });

  const { data: first } = await db.rpc("claim_due_jobs", { batch_size: 2 });
  assertEquals(first.length, 2);
  const { data: second } = await db.rpc("claim_due_jobs", { batch_size: 2 });
  assertEquals(second.length, 1);
});

Deno.test("claim_due_jobs: concurrent callers never receive the same job", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  for (let i = 0; i < 8; i++) await seedTarget(db, { url: `http://c${i}.test/ping` });

  // four cycles racing, as two cron ticks overlapping would
  const batches = await Promise.all(
    [0, 1, 2, 3].map(() => db.rpc("claim_due_jobs", { batch_size: 8 })),
  );
  const ids = batches.flatMap((b) => (b.data ?? []).map((r: { job_id: string }) => r.job_id));
  assertEquals(ids.length, 8, "every job handed out exactly once");
  assertEquals(new Set(ids).size, 8, "no job handed to two callers");
});

Deno.test("reschedule_job: success resets failures and pushes next_run_at forward", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db, { interval_seconds: 60 });
  await db.from("jobs").update({
    consecutive_failures: 3,
    status: "claimed",
    claimed_at: new Date().toISOString(),
  }).eq("target_id", t.id);
  const { data: job } = await db.from("jobs").select("id").eq("target_id", t.id).single();
  assertExists(job);

  const { error } = await db.rpc("reschedule_job", { p_job_id: job.id, p_ok: true });
  assertEquals(error, null);

  const { data: after } = await db.from("jobs")
    .select("status, consecutive_failures, next_run_at, claimed_at, last_run_at")
    .eq("id", job.id).single();
  assertExists(after);
  assertEquals(after.status, "idle");
  assertEquals(after.consecutive_failures, 0);
  assertEquals(after.claimed_at, null);
  assertExists(after.last_run_at);
  assertEquals(new Date(after.next_run_at).getTime() > Date.now(), true);
});

Deno.test("reschedule_job: failure increments consecutive_failures", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db);
  const { data: job } = await db.from("jobs").select("id").eq("target_id", t.id).single();
  assertExists(job);
  await db.rpc("reschedule_job", { p_job_id: job.id, p_ok: false });
  const { data: after } = await db.from("jobs")
    .select("consecutive_failures").eq("id", job.id).single();
  assertExists(after);
  assertEquals(after.consecutive_failures, 1);
});

Deno.test("reschedule_job: honours min_interval_seconds, not the target's interval", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db, { interval_seconds: 60 });
  // entitlements floor the cadence on the job row; the hot path never joins to billing
  await db.from("jobs").update({ min_interval_seconds: 3600 }).eq("target_id", t.id);
  const { data: job } = await db.from("jobs").select("id").eq("target_id", t.id).single();
  assertExists(job);

  await db.rpc("reschedule_job", { p_job_id: job.id, p_ok: true });
  const { data: after } = await db.from("jobs").select("next_run_at").eq("id", job.id).single();
  assertExists(after);
  const secondsOut = (new Date(after.next_run_at).getTime() - Date.now()) / 1000;
  assertEquals(secondsOut > 3000, true, `expected ~3600s out, got ${secondsOut}s`);
});

Deno.test("reap_stuck_jobs: resets jobs claimed longer than the max age", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db);
  await db.from("jobs").update({
    status: "claimed",
    claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  }).eq("target_id", t.id);

  const { data: reaped, error } = await db.rpc("reap_stuck_jobs", {
    p_max_claim_age_seconds: 300,
  });
  assertEquals(error, null);
  assertEquals(reaped, 1);
  const { data: job } = await db.from("jobs").select("status").eq("target_id", t.id).single();
  assertExists(job);
  assertEquals(job.status, "idle");
});

Deno.test("reap_stuck_jobs: leaves freshly claimed jobs alone", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db);
  await db.from("jobs").update({
    status: "claimed",
    claimed_at: new Date(Date.now() - 30_000).toISOString(),
  }).eq("target_id", t.id);

  const { data: reaped } = await db.rpc("reap_stuck_jobs", { p_max_claim_age_seconds: 300 });
  assertEquals(reaped, 0);
  const { data: job } = await db.from("jobs").select("status").eq("target_id", t.id).single();
  assertExists(job);
  assertEquals(job.status, "claimed", "an in-flight ping must not be reaped mid-run");
});

Deno.test("target sync: enabling a target creates one job, disabling removes it", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const { data: t } = await db.from("targets").insert({
    platform: "custom",
    url: "http://example.test/ping",
    heartbeat_type: "plain",
    interval_seconds: 90,
    enabled: true,
  }).select().single();
  assertExists(t);

  const { data: jobs1 } = await db.from("jobs")
    .select("min_interval_seconds").eq("target_id", t.id);
  assertEquals(jobs1?.length, 1);
  assertEquals(jobs1?.[0].min_interval_seconds, 90);

  await db.from("targets").update({ enabled: false }).eq("id", t.id);
  const { data: jobs2 } = await db.from("jobs").select("id").eq("target_id", t.id);
  assertEquals(jobs2?.length, 0);

  // re-enabling brings the job back, due now
  await db.from("targets").update({ enabled: true }).eq("id", t.id);
  const { data: jobs3 } = await db.from("jobs").select("id").eq("target_id", t.id);
  assertEquals(jobs3?.length, 1);
});

Deno.test("target sync: changing interval_seconds updates the job cadence", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const { data: t } = await db.from("targets").insert({
    platform: "custom",
    url: "http://example.test/ping",
    heartbeat_type: "plain",
    interval_seconds: 60,
  }).select().single();
  assertExists(t);

  await db.from("targets").update({ interval_seconds: 300 }).eq("id", t.id);
  const { data: job } = await db.from("jobs")
    .select("min_interval_seconds").eq("target_id", t.id).single();
  assertExists(job);
  assertEquals(job.min_interval_seconds, 300);
});

Deno.test("target sync: re-enabling does not reset an existing job's failure streak", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const t = await seedTarget(db);
  await db.from("jobs").update({ consecutive_failures: 4 }).eq("target_id", t.id);

  // an unrelated config edit must not wipe the monitoring signal
  await db.from("targets").update({ interval_seconds: 120 }).eq("id", t.id);
  const { data: job } = await db.from("jobs")
    .select("consecutive_failures, min_interval_seconds").eq("target_id", t.id).single();
  assertExists(job);
  assertEquals(job.min_interval_seconds, 120);
  assertEquals(job.consecutive_failures, 4);
});

Deno.test("runCycle: pings a live target, logs success, advances next_run_at", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const echo = startEchoServer(() => new Response("ok", { status: 200 }));
  try {
    const { data: t } = await db.from("targets").insert({
      platform: "custom",
      url: echo.url,
      heartbeat_type: "plain",
      interval_seconds: 60,
    }).select().single();
    assertExists(t);

    const { processed } = await runCycle(db, { batchSize: 50 });
    assertEquals(processed, 1);

    const { data: logs } = await db.from("ping_log")
      .select("ok, status_code, latency_ms, error").eq("target_id", t.id);
    assertEquals(logs?.length, 1);
    assertEquals(logs?.[0].ok, true);
    assertEquals(logs?.[0].status_code, 200);
    assertEquals(logs?.[0].error, null);
    assertEquals(typeof logs?.[0].latency_ms, "number");

    const { data: job } = await db.from("jobs")
      .select("status, next_run_at, consecutive_failures").eq("target_id", t.id).single();
    assertExists(job);
    assertEquals(job.status, "idle");
    assertEquals(job.consecutive_failures, 0);
    assertEquals(new Date(job.next_run_at).getTime() > Date.now(), true);
  } finally {
    await echo.stop();
  }
});

Deno.test("runCycle: a supabase 540 records a pause_event", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const echo = startEchoServer(() => new Response("", { status: 540 }));
  try {
    const { data: t } = await db.from("targets").insert({
      platform: "supabase",
      url: echo.url,
      heartbeat_type: "db_query",
      interval_seconds: 60,
    }).select().single();
    assertExists(t);

    await runCycle(db);
    const { data: pauses } = await db.from("pause_events")
      .select("signal, platform, last_ok_ping_at").eq("target_id", t.id);
    assertEquals(pauses?.length, 1);
    assert(pauses?.[0].signal.includes("540"));
    assertEquals(pauses?.[0].platform, "supabase");
    assertEquals(pauses?.[0].last_ok_ping_at, null, "no successful ping has ever happened");
  } finally {
    await echo.stop();
  }
});

Deno.test("runCycle: pause_event carries the buffer since the last good ping", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const echo = startEchoServer(() => new Response("", { status: 540 }));
  try {
    const { data: t } = await db.from("targets").insert({
      platform: "supabase",
      url: echo.url,
      heartbeat_type: "db_query",
      interval_seconds: 60,
    }).select().single();
    assertExists(t);

    // a good ping two days ago, then the platform pauses
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await db.from("ping_log").insert({
      target_id: t.id,
      ran_at: twoDaysAgo,
      ok: true,
      status_code: 200,
      latency_ms: 12,
    });

    await runCycle(db);
    const { data: pauses } = await db.from("pause_events")
      .select("last_ok_ping_at, days_since_last_ok").eq("target_id", t.id).single();
    assertExists(pauses);
    assertEquals(new Date(pauses.last_ok_ping_at).toISOString(), twoDaysAgo);
    assert(
      Math.abs(Number(pauses.days_since_last_ok) - 2) < 0.01,
      `expected ~2 days of buffer, got ${pauses.days_since_last_ok}`,
    );
  } finally {
    await echo.stop();
  }
});

Deno.test("runCycle: a failing target logs the failure and returns the job to the queue", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const echo = startEchoServer(() => new Response("", { status: 500 }));
  try {
    const { data: t } = await db.from("targets").insert({
      platform: "custom",
      url: echo.url,
      heartbeat_type: "plain",
      interval_seconds: 60,
    }).select().single();
    assertExists(t);

    await runCycle(db);
    const { data: logs } = await db.from("ping_log").select("ok, status_code").eq("target_id", t.id);
    assertEquals(logs?.[0].ok, false);
    assertEquals(logs?.[0].status_code, 500);

    const { data: job } = await db.from("jobs")
      .select("status, consecutive_failures").eq("target_id", t.id).single();
    assertExists(job);
    assertEquals(job.status, "idle", "a failed ping must not strand the job");
    assertEquals(job.consecutive_failures, 1);

    // no pause_event: `custom` has no calibrated pause signature
    const { data: pauses } = await db.from("pause_events").select("id").eq("target_id", t.id);
    assertEquals(pauses?.length, 0);
  } finally {
    await echo.stop();
  }
});

Deno.test("runCycle: a hung target is given up on and its job returned to the queue", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  // accepts the connection, never answers
  const echo = startEchoServer(() => new Promise<Response>(() => {}));
  try {
    const { data: t } = await db.from("targets").insert({
      platform: "custom",
      url: echo.url,
      heartbeat_type: "plain",
      interval_seconds: 60,
    }).select().single();
    assertExists(t);

    const { processed } = await runCycle(db, { timeoutMs: 400 });
    assertEquals(processed, 1);

    const { data: logs } = await db.from("ping_log").select("ok, error").eq("target_id", t.id);
    assertEquals(logs?.[0].ok, false);
    assert(logs?.[0].error?.includes("timeout"), `expected a timeout error, got ${logs?.[0].error}`);

    const { data: job } = await db.from("jobs").select("status").eq("target_id", t.id).single();
    assertExists(job);
    assertEquals(job.status, "idle", "a hung target must not strand the job until the reaper");
  } finally {
    await echo.stop();
  }
});

Deno.test("runCycle: does nothing when no job is due", async () => {
  const db = getServiceClient();
  await resetEngineTables(db);
  const { processed } = await runCycle(db);
  assertEquals(processed, 0);
});
