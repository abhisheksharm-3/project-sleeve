import { assert, assertEquals } from "@std/assert";
import { detectPause, type Job, runHeartbeat } from "./strategies.ts";

const baseJob: Job = {
  job_id: "j1",
  target_id: "t1",
  url: "http://x.test/ping",
  method: "GET",
  heartbeat_type: "plain",
  secret: null,
  platform: "custom",
};

Deno.test("runHeartbeat: 200 → ok with status and latency", async () => {
  let seconds = 0;
  const now = () => (seconds += 0.05, seconds * 1000); // +50ms per call
  const fetchFn =
    (() => Promise.resolve(new Response("anything", { status: 200 }))) as typeof fetch;
  const r = await runHeartbeat(baseJob, { fetchFn, now });
  assertEquals(r.ok, true);
  assertEquals(r.status_code, 200);
  assert(r.latency_ms !== null && r.latency_ms >= 0);
  assertEquals(r.error, null);
});

Deno.test("runHeartbeat: 500 → not ok, status recorded", async () => {
  const fetchFn = (() => Promise.resolve(new Response("", { status: 500 }))) as typeof fetch;
  const r = await runHeartbeat(baseJob, { fetchFn });
  assertEquals(r.ok, false);
  assertEquals(r.status_code, 500);
});

Deno.test("runHeartbeat: a 302 still counts as alive", async () => {
  const fetchFn = (() => Promise.resolve(new Response("", { status: 302 }))) as typeof fetch;
  const r = await runHeartbeat(baseJob, { fetchFn });
  assertEquals(r.ok, true);
  assertEquals(r.status_code, 302);
});

Deno.test("runHeartbeat: network throw → not ok, error message, no status", async () => {
  const fetchFn = (() => Promise.reject(new Error("connreset"))) as typeof fetch;
  const r = await runHeartbeat(baseJob, { fetchFn });
  assertEquals(r.ok, false);
  assertEquals(r.status_code, null);
  assertEquals(r.error, "connreset");
});

Deno.test("runHeartbeat: db_query sends mode header and bearer secret", async () => {
  let seen: Headers | undefined;
  const fetchFn = ((_u: string | URL | Request, init: RequestInit) => {
    seen = new Headers(init.headers);
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;
  await runHeartbeat({ ...baseJob, heartbeat_type: "db_query", secret: "s3" }, { fetchFn });
  assertEquals(seen?.get("x-sleeve-mode"), "db_query");
  assertEquals(seen?.get("authorization"), "Bearer s3");
});

Deno.test("runHeartbeat: plain sends no mode header and no authorization", async () => {
  let seen: Headers | undefined;
  const fetchFn = ((_u: string | URL | Request, init: RequestInit) => {
    seen = new Headers(init.headers);
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;
  await runHeartbeat(baseJob, { fetchFn });
  assertEquals(seen?.get("x-sleeve-mode"), null);
  assertEquals(seen?.get("authorization"), null);
});

Deno.test("runHeartbeat: synthetic is not implemented yet", async () => {
  const r = await runHeartbeat({ ...baseJob, heartbeat_type: "synthetic" });
  assertEquals(r.ok, false);
  assertEquals(r.error, "NotImplemented: synthetic");
});

Deno.test("runHeartbeat: a hung target fails on the deadline instead of blocking", async () => {
  // A target that accepts the connection and never answers must not strand the job in
  // 'claimed' until the reaper, nor burn the whole Edge Function wall clock.
  const fetchFn =
    ((_u: string | URL | Request, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("timeout", "TimeoutError")),
        );
      })) as unknown as typeof fetch;

  const started = performance.now();
  const r = await runHeartbeat(baseJob, { fetchFn, timeoutMs: 150 });
  const elapsed = performance.now() - started;

  assertEquals(r.ok, false);
  assertEquals(r.status_code, null);
  assert(r.error !== null, "a timeout must be recorded as an error");
  assert(elapsed < 2000, `should give up on the deadline, took ${Math.round(elapsed)}ms`);
});

Deno.test("runHeartbeat: never reads the response body (data minimization)", async () => {
  // spec §8: we store status, latency and error types. The body is the user's data and
  // must never be read into memory, let alone returned for logging.
  // highWaterMark 0 keeps the stream from pulling to fill its queue at construction, so
  // `pulled` flips only if something actually reads.
  let pulled = false;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled = true;
      controller.enqueue(new TextEncoder().encode("secret user data"));
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  const fetchFn = (() => Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;

  const r = await runHeartbeat(baseJob, { fetchFn });
  assertEquals(pulled, false, "the response body must never be pulled");
  assertEquals(cancelled, true, "the body must be cancelled so the connection is released");
  assertEquals(Object.keys(r).sort(), ["error", "latency_ms", "ok", "status_code"]);
});

Deno.test("detectPause: supabase 540 → paused", () => {
  const r = detectPause({ ...baseJob, platform: "supabase" }, {
    ok: false,
    status_code: 540,
    latency_ms: null,
    error: null,
  });
  assertEquals(r.paused, true);
  assert(r.signal !== null && r.signal.includes("540"));
});

Deno.test("detectPause: render 503 → paused", () => {
  const r = detectPause({ ...baseJob, platform: "render" }, {
    ok: false,
    status_code: 503,
    latency_ms: null,
    error: null,
  });
  assertEquals(r.paused, true);
});

Deno.test("detectPause: custom platform never paused (just failing)", () => {
  const r = detectPause({ ...baseJob, platform: "custom" }, {
    ok: false,
    status_code: 503,
    latency_ms: null,
    error: null,
  });
  assertEquals(r.paused, false);
});

Deno.test("detectPause: a healthy 200 is never paused", () => {
  const r = detectPause({ ...baseJob, platform: "supabase" }, {
    ok: true,
    status_code: 200,
    latency_ms: 10,
    error: null,
  });
  assertEquals(r.paused, false);
});

Deno.test("detectPause: a supabase 500 is a failure, not a pause", () => {
  const r = detectPause({ ...baseJob, platform: "supabase" }, {
    ok: false,
    status_code: 500,
    latency_ms: null,
    error: null,
  });
  assertEquals(r.paused, false);
});

Deno.test("detectPause: a network error is not a pause signal", () => {
  // no status line means we cannot tell a paused project from a broken DNS entry;
  // claiming a pause here would poison the one dataset that measures the product
  const r = detectPause({ ...baseJob, platform: "supabase" }, {
    ok: false,
    status_code: null,
    latency_ms: null,
    error: "connreset",
  });
  assertEquals(r.paused, false);
  assertEquals(r.signal, null);
});

Deno.test("detectPause: platforms with no known pause signature never report paused", () => {
  for (const platform of ["appwrite", "railway"]) {
    const r = detectPause({ ...baseJob, platform }, {
      ok: false,
      status_code: 503,
      latency_ms: null,
      error: null,
    });
    assertEquals(r.paused, false, `${platform} has no calibrated signature yet`);
  }
});
