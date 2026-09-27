import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnose, isRestoreLink, probeTarget, restoreUrl } from "./probe.ts";

const sb = {
  platform: "supabase",
  url: "https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/keepalive",
  heartbeat_type: "db_query",
  method: "GET",
  secret: "anon",
  platform_ref: null,
};
const reply = (status: number, body: unknown) =>
  (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch;

test("a 200 passes without a diagnosis", async () => {
  const r = await probeTarget(sb, reply(200, "1"));
  assert.equal(r.ok, true);
  assert.equal(r.diagnosis, null);
});

test("supabase: missing keepalive function names the fix", async () => {
  const r = await probeTarget(sb, reply(404, { code: "PGRST202" }));
  assert.equal(r.ok, false);
  assert.match(r.diagnosis ?? "", /keepalive\(\) is not installed/);
});

test("supabase: a table the anon role cannot read points at keepalive()", async () => {
  const r = await probeTarget(
    { ...sb, url: "https://abcdefghijklmnopqrst.supabase.co/rest/v1/gists?limit=1" },
    reply(401, { code: "42501" }),
  );
  assert.match(r.diagnosis ?? "", /cannot read that table/);
});

test("supabase: a paused project comes back with its restore link", async () => {
  const r = await probeTarget(sb, reply(540, ""));
  assert.match(r.diagnosis ?? "", /paused/);
  assert.equal(r.restoreUrl, "https://supabase.com/dashboard/project/abcdefghijklmnopqrst");
});

test("appwrite: table and project errors are told apart", () => {
  const aw = {
    ...sb,
    platform: "appwrite",
    heartbeat_type: "db_write",
    method: "PUT",
    platform_ref: "p1",
    url: "https://fra.cloud.appwrite.io/v1/tablesdb/db/tables/t/rows/sleeve",
  };
  assert.match(diagnose(aw, 404, { type: "table_not_found" }) ?? "", /Table ID/);
  assert.match(diagnose(aw, 404, { type: "project_not_found" }) ?? "", /project ID/);
  assert.match(diagnose(aw, 401, { type: "general_unauthorized_scope" }) ?? "", /rows\.write/);
});

test("a network failure is reported, not thrown", async () => {
  const r = await probeTarget(sb, (async () => {
    throw new Error("getaddrinfo ENOTFOUND");
  }) as unknown as typeof fetch);
  assert.equal(r.ok, false);
  assert.match(r.diagnosis ?? "", /could not reach/i);
});

test("restoreUrl knows where each platform restores a project", () => {
  assert.equal(
    restoreUrl({ ...sb }),
    "https://supabase.com/dashboard/project/abcdefghijklmnopqrst",
  );
  assert.equal(
    restoreUrl({
      ...sb,
      platform: "appwrite",
      platform_ref: "p1",
      url: "https://fra.cloud.appwrite.io/v1/x",
    }),
    "https://appwrite.io/projects/p1",
  );
  assert.equal(
    restoreUrl({ ...sb, platform: "huggingface", url: "https://gradio-hello-world.hf.space/" }),
    null,
  );
  assert.equal(restoreUrl({ ...sb, platform: "custom", url: "https://x.test/" }), null);
});

test("isRestoreLink only accepts the platforms' own dashboards", () => {
  assert.equal(isRestoreLink("https://supabase.com/dashboard/project/abcdefghijklmnopqrst"), true);
  assert.equal(isRestoreLink("https://appwrite.io/projects/66a4c1820020c6133651"), true);
  for (const bad of [
    "javascript:alert(1)",
    "https://evil.com/dashboard/project/x",
    "https://supabase.com.evil.com/dashboard/project/x",
    "https://supabase.com/dashboard/project/x/../../y",
    undefined,
  ]) {
    assert.equal(isRestoreLink(bad), false, String(bad));
  }
});
