import assert from "node:assert/strict";
import { test } from "node:test";
import { installKeepalive, pickPublicKey } from "./supabase-mgmt.ts";
import { KEEPALIVE_SQL } from "./target-url.ts";

const jwt = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;

test("prefers a publishable key and never returns a secret one", () => {
  const keys = [
    { name: "anon", type: "legacy", api_key: jwt("anon") },
    { name: "service_role", type: "legacy", api_key: jwt("service_role") },
    { name: "default", type: "publishable", api_key: "sb_publishable_abc" },
    { name: "default", type: "secret", api_key: "sb_secret_abc" },
  ];
  assert.equal(pickPublicKey(keys), "sb_publishable_abc");
});

test("falls back to the legacy anon key", () => {
  assert.equal(
    pickPublicKey([
      { name: "service_role", type: "legacy", api_key: jwt("service_role") },
      { name: "anon", type: "legacy", api_key: jwt("anon") },
    ]),
    jwt("anon"),
  );
});

test("refuses when only secret keys exist, or a key named anon is really service-role", () => {
  assert.equal(
    pickPublicKey([{ name: "service_role", type: "legacy", api_key: jwt("service_role") }]),
    null,
  );
  assert.equal(
    pickPublicKey([{ name: "anon", type: "legacy", api_key: jwt("service_role") }]),
    null,
  );
  assert.equal(
    pickPublicKey([{ name: "x", type: "publishable", api_key: "sb_secret_trick" }]),
    null,
  );
});

test("installKeepalive sends exactly the keepalive snippet", async () => {
  let sent: { url?: string; body?: string; method?: string } = {};
  const fake = (async (url: string, init: RequestInit) => {
    sent = { url, body: String(init.body), method: init.method };
    return new Response("[]", { status: 201 });
  }) as unknown as typeof fetch;
  await installKeepalive("tok", "abcdefghijklmnopqrst", fake);
  assert.equal(sent.method, "POST");
  assert.equal(
    sent.url,
    "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/query",
  );
  assert.deepEqual(JSON.parse(sent.body ?? "{}"), { query: KEEPALIVE_SQL });
});
