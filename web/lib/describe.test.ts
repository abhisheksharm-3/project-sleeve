import assert from "node:assert/strict";
import { test } from "node:test";
import { caveat, methodText, statusOf, targetTitle } from "./describe.ts";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const sb = {
  url: "https://xlivxxxyudbfbtsmemxp.supabase.co/rest/v1/rpc/keepalive",
  platform: "supabase",
  heartbeat_type: "db_query",
};
const site = { url: "https://inquora.vercel.app/", platform: "custom", heartbeat_type: "plain" };
const ok = {
  target_id: "t",
  pause_window_seconds: 604800,
  last_ping_at: "2026-09-27T10:00:00Z",
  last_ok_at: "2026-09-27T10:00:00Z",
  failures_since_ok: 0,
  pings_7d: 20,
  uptime_7d: 100,
  latency_7d: null,
  pause_at: "2026-10-04T10:00:00Z",
};

test("titles name the platform and the instance, never the raw URL", () => {
  assert.deepEqual(targetTitle(sb), { title: "Supabase database", detail: "xlivxxxyudbfbtsmemxp" });
  assert.deepEqual(targetTitle(site), { title: "Website", detail: "inquora.vercel.app" });
  assert.deepEqual(
    targetTitle({
      url: "https://gradio-hello-world.hf.space/",
      platform: "huggingface",
      heartbeat_type: "plain",
    }),
    { title: "Hugging Face Space", detail: "gradio-hello-world" },
  );
});

test("methodText says what the check does", () => {
  assert.equal(methodText(sb), "calls keepalive() in your database");
  assert.equal(
    methodText({ ...sb, url: "https://a.supabase.co/rest/v1/profiles?limit=1" }),
    "reads one row from profiles",
  );
  assert.equal(
    methodText({
      url: "https://fra.cloud.appwrite.io/v1/x",
      platform: "appwrite",
      heartbeat_type: "db_write",
    }),
    "writes one heartbeat row",
  );
  assert.equal(methodText(site), "visits the page");
});

test("a plain website check warns that it does not keep a database awake", () => {
  assert.match(caveat(site) ?? "", /does not keep a separate database awake/);
  assert.equal(caveat(sb), null);
});

test("statusOf gives one headline and one sentence per state", () => {
  assert.deepEqual(statusOf(sb, ok, NOW), {
    state: "alive",
    headline: "Awake",
    sentence: "Checked 2h ago. Supabase would pause it in 6d 22h if checks stopped.",
  });
  assert.equal(statusOf(sb, undefined, NOW).headline, "Waiting");
  assert.equal(
    statusOf(
      sb,
      {
        ...ok,
        failures_since_ok: 3,
        last_ok_at: "2026-09-26T12:00:00Z",
        pause_at: "2026-10-03T12:00:00Z",
      },
      NOW,
    ).sentence,
    "3 checks failed in a row. Last success 1d ago.",
  );
  assert.equal(
    statusOf(sb, { ...ok, pause_at: "2026-09-27T10:00:00Z" }, NOW).headline,
    "Probably paused",
  );
  assert.equal(
    statusOf(site, { ...ok, pause_window_seconds: null, pause_at: null }, NOW).headline,
    "Up",
  );
});
