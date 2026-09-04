import { assertEquals, assertExists } from "@std/assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient, resetEngineTables } from "../helpers/db.ts";

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
