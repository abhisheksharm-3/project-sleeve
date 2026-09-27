import { assert, assertEquals } from "@std/assert";
import {
  deadlineFor,
  DEFAULT_TIMEOUT_MS,
  detectPause,
  type Job,
  runHeartbeat,
} from "./strategies.ts";

const baseJob: Job = {
  job_id: "j1",
  target_id: "t1",
  url: "http://x.test/ping",
  method: "GET",
  heartbeat_type: "plain",
  secret: null,
  platform: "custom",
  platform_ref: null,
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

Deno.test("runHeartbeat: a supabase target also sends the key as apikey", () => {
  // Supabase's gateway authenticates on the apikey header; Authorization alone is a 401,
  // so a bearer-only ping never reaches PostgREST and never touches Postgres.
  let seen: Headers | undefined;
  const fetchFn = ((_u: string | URL | Request, init: RequestInit) => {
    seen = new Headers(init.headers);
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;

  return runHeartbeat({ ...baseJob, platform: "supabase", secret: "anon-key" }, { fetchFn })
    .then(() => {
      assertEquals(seen?.get("apikey"), "anon-key");
      assertEquals(seen?.get("authorization"), "Bearer anon-key");
    });
});

Deno.test("runHeartbeat: non-supabase targets never leak the key into apikey", () => {
  let seen: Headers | undefined;
  const fetchFn = ((_u: string | URL | Request, init: RequestInit) => {
    seen = new Headers(init.headers);
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;

  return runHeartbeat({ ...baseJob, platform: "custom", secret: "s3" }, { fetchFn })
    .then(() => {
      assertEquals(seen?.get("apikey"), null);
      assertEquals(seen?.get("authorization"), "Bearer s3");
    });
});

Deno.test("runHeartbeat: a supabase target with no secret sends neither header", () => {
  let seen: Headers | undefined;
  const fetchFn = ((_u: string | URL | Request, init: RequestInit) => {
    seen = new Headers(init.headers);
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;

  return runHeartbeat({ ...baseJob, platform: "supabase", secret: null }, { fetchFn })
    .then(() => {
      assertEquals(seen?.get("apikey"), null);
      assertEquals(seen?.get("authorization"), null);
    });
});

Deno.test("deadlineFor: cold-start platforms get longer than the default", () => {
  assertEquals(deadlineFor("huggingface"), 45_000);
  assertEquals(deadlineFor("render"), 45_000);
  assertEquals(deadlineFor("supabase"), DEFAULT_TIMEOUT_MS);
  assertEquals(deadlineFor("custom"), DEFAULT_TIMEOUT_MS);
});

Deno.test("runHeartbeat: uses the platform deadline when none is given", async () => {
  let aborted = false;
  const fetchFn =
    ((_u: string | URL | Request, init: RequestInit) =>
      new Promise<Response>((resolve) => {
        init.signal?.addEventListener("abort", () => (aborted = true));
        setTimeout(() => resolve(new Response("", { status: 200 })), 20_000);
      })) as unknown as typeof fetch;
  const started = performance.now();
  const r = await runHeartbeat({ ...baseJob, platform: "huggingface" }, { fetchFn });
  assertEquals(aborted, false, "a 20s cold start must not trip a 45s deadline");
  assertEquals(r.ok, true);
  assert(performance.now() - started >= 19_000);
});

Deno.test("runHeartbeat: an appwrite db_write upserts one timestamp row with Appwrite headers", async () => {
  let seen: { method?: string; headers?: Headers; body?: string } = {};
  const fetchFn = ((_u: string | URL | Request, init: RequestInit) => {
    seen = { method: init.method, headers: new Headers(init.headers), body: String(init.body) };
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;

  const r = await runHeartbeat({
    ...baseJob,
    platform: "appwrite",
    heartbeat_type: "db_write",
    url: "https://fra.cloud.appwrite.io/v1/tablesdb/sleeve/tables/heartbeats/rows/sleeve",
    secret: "standard_rowswrite",
    platform_ref: "proj123",
  }, { fetchFn });

  assertEquals(r.ok, true);
  assertEquals(seen.method, "PUT");
  assertEquals(seen.headers?.get("x-appwrite-project"), "proj123");
  assertEquals(seen.headers?.get("x-appwrite-key"), "standard_rowswrite");
  assertEquals(seen.headers?.get("content-type"), "application/json");
  assertEquals(
    seen.headers?.get("authorization"),
    null,
    "the Appwrite key must not travel as a bearer token",
  );
  const body = JSON.parse(seen.body ?? "{}");
  assertEquals(Object.keys(body.data), ["beat"], "we write a timestamp and nothing else");
  assert(!Number.isNaN(Date.parse(body.data.beat)));
});

Deno.test("runHeartbeat: db_write without a project ref fails before any request", async () => {
  let called = false;
  const fetchFn = (() => {
    called = true;
    return Promise.resolve(new Response("", { status: 200 }));
  }) as unknown as typeof fetch;
  const r = await runHeartbeat({
    ...baseJob,
    platform: "appwrite",
    heartbeat_type: "db_write",
    secret: "k",
    platform_ref: null,
  }, { fetchFn });
  assertEquals(r.ok, false);
  assertEquals(called, false);
});

const mongoJob: Job = {
  job_id: "j",
  target_id: "t",
  url: "mongodb+srv://cluster0.abcde.mongodb.net",
  method: "GET",
  heartbeat_type: "db_connect",
  secret: "mongodb+srv://sleeve:hunter2@cluster0.abcde.mongodb.net/?appName=x",
  platform: "mongodb",
  platform_ref: null,
};

Deno.test("db_connect: a successful ping is ok, with latency and no status line", async () => {
  let seen = "";
  let t = 0;
  const r = await runHeartbeat(mongoJob, {
    dbPing: (uri) => {
      seen = uri;
      return Promise.resolve();
    },
    now: () => (t += 40),
  });
  assertEquals(seen, mongoJob.secret);
  assertEquals(r, { ok: true, status_code: null, latency_ms: 40, error: null });
});

Deno.test("db_connect: failures never log the password", async () => {
  const r = await runHeartbeat(mongoJob, {
    dbPing: () => Promise.reject(new Error(`auth failed for ${mongoJob.secret}`)),
  });
  assertEquals(r.ok, false);
  assertEquals(r.error?.includes("hunter2"), false);
  assertEquals(r.error?.includes("mongodb+srv://***@cluster0"), true);
});

Deno.test("db_connect: no connection string, no attempt", async () => {
  const r = await runHeartbeat({ ...mongoJob, secret: null }, {
    dbPing: () => Promise.reject(new Error("should not run")),
  });
  assertEquals(r.error, "missing connection string");
});
