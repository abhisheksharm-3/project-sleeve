import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlockedAddress, supabaseTableUrl, validateTargetUrl } from "./target-url.ts";

const publicDns = async () => [{ address: "93.184.216.34" }];
const privateDns = async () => [{ address: "10.0.0.5" }];
const mixedDns = async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }];

test("isBlockedAddress refuses private, loopback, metadata and mapped addresses", () => {
  for (const a of [
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "0.0.0.0",
  ]) {
    assert.equal(isBlockedAddress(a), true, a);
  }
  for (const a of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]) {
    assert.equal(isBlockedAddress(a), false, a);
  }
});

test("validateTargetUrl accepts a public https URL", async () => {
  const r = await validateTargetUrl("https://example.com/health", publicDns);
  assert.deepEqual(r, { ok: true, url: "https://example.com/health" });
});

test("validateTargetUrl refuses a host that resolves privately, even partly", async () => {
  assert.equal((await validateTargetUrl("https://sneaky.test/", privateDns)).ok, false);
  assert.equal((await validateTargetUrl("https://sneaky.test/", mixedDns)).ok, false);
});

test("validateTargetUrl refuses literal private IPs, other schemes, credentials and localhost", async () => {
  for (const raw of [
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:pw@example.com",
    "http://localhost:3000",
    "not a url",
  ]) {
    assert.equal((await validateTargetUrl(raw, publicDns)).ok, false, raw);
  }
});

test("supabaseTableUrl builds a table read and rejects anything else", () => {
  assert.equal(
    supabaseTableUrl("https://nujgeowsnjculknvimbh.supabase.co", "profiles"),
    "https://nujgeowsnjculknvimbh.supabase.co/rest/v1/profiles?limit=1",
  );
  assert.equal(supabaseTableUrl("https://evil.com", "profiles"), null);
  assert.equal(supabaseTableUrl("https://nujgeowsnjculknvimbh.supabase.co", "x; drop"), null);
  assert.equal(supabaseTableUrl("https://nujgeowsnjculknvimbh.supabase.co", "../auth"), null);
});
