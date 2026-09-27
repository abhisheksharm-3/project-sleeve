import assert from "node:assert/strict";
import { test } from "node:test";
import { graceSeconds, TOKEN } from "./heartbeat.ts";

test("grace is a tenth of the period, never under five minutes", () => {
  assert.equal(graceSeconds(300), 300);
  assert.equal(graceSeconds(3_600), 360);
  assert.equal(graceSeconds(86_400), 8_640);
});

test("tokens are url-safe and long", () => {
  assert.equal(TOKEN.test("a".repeat(32)), true);
  assert.equal(TOKEN.test("short"), false);
  assert.equal(TOKEN.test(`${"a".repeat(31)}/`), false);
});
