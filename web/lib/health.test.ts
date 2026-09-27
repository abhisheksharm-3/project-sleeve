import assert from "node:assert/strict";
import { test } from "node:test";
import { bufferText, type Health, passRate, stateOf } from "./health.ts";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const h = (over: Partial<Health>): Health => ({
  target_id: "t",
  pause_window_seconds: 604800,
  last_ping_at: "2026-09-27T11:00:00Z",
  last_ok_at: "2026-09-27T11:00:00Z",
  failures_since_ok: 0,
  pings_7d: 28,
  uptime_7d: 100,
  latency_7d: null,
  pause_at: "2026-10-04T11:00:00Z",
  ...over,
});

test("stateOf ranks paused over failing over pause_soon over alive", () => {
  assert.equal(stateOf(undefined, NOW), "idle");
  assert.equal(stateOf(h({ last_ping_at: null }), NOW), "idle");
  assert.equal(stateOf(h({}), NOW), "alive");
  assert.equal(stateOf(h({ pause_at: "2026-09-28T10:00:00Z" }), NOW), "pause_soon");
  assert.equal(
    stateOf(h({ failures_since_ok: 3, pause_at: "2026-09-28T10:00:00Z" }), NOW),
    "failing",
  );
  assert.equal(
    stateOf(h({ failures_since_ok: 5, pause_at: "2026-09-27T10:00:00Z" }), NOW),
    "paused",
  );
});

test("stateOf never calls a short-window platform pause_soon", () => {
  assert.equal(
    stateOf(h({ pause_window_seconds: 900, pause_at: "2026-09-27T12:10:00Z" }), NOW),
    "alive",
  );
});

test("bufferText reads in days and hours, minutes near the end, and null without a window", () => {
  assert.equal(bufferText(h({}), NOW), "6d 23h before pause");
  assert.equal(bufferText(h({ pause_at: "2026-09-27T21:30:00Z" }), NOW), "9h before pause");
  assert.equal(bufferText(h({ pause_at: "2026-09-27T12:25:00Z" }), NOW), "25m before pause");
  assert.equal(
    bufferText(h({ pause_at: "2026-09-27T10:00:00Z" }), NOW),
    "pause window passed 2h ago",
  );
  assert.equal(bufferText(h({ pause_at: null }), NOW), null);
});

test("passRate weights by checks run, and is null with no checks", () => {
  assert.equal(
    passRate([h({ pings_7d: 90, uptime_7d: 100 }), h({ pings_7d: 10, uptime_7d: 0 })]),
    90,
  );
  assert.equal(passRate([h({ pings_7d: 0, uptime_7d: null })]), null);
});
