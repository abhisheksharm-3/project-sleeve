import assert from "node:assert/strict";
import { test } from "node:test";
import { dayCells, dayState, span, uptimeOver } from "./uptime.ts";

const NOW = Date.parse("2026-09-27T12:00:00Z");

test("dayState tells a clean day from a partial one, a dead one and an empty one", () => {
  assert.equal(dayState({ pings: 4, ok: 4 }), "up");
  assert.equal(dayState({ pings: 4, ok: 1 }), "partial");
  assert.equal(dayState({ pings: 4, ok: 0 }), "down");
  assert.equal(dayState({ pings: 0, ok: 0 }), "none");
  assert.equal(dayState(undefined), "none");
});

test("dayCells ends today, oldest first, and fills days that ran nothing", () => {
  const cells = dayCells(
    [
      { day: "2026-09-27", pings: 2, ok: 1 },
      { day: "2026-09-25", pings: 3, ok: 3 },
    ],
    3,
    NOW,
  );
  assert.deepEqual(cells, [
    { day: "2026-09-25", state: "up", uptime: 100 },
    { day: "2026-09-26", state: "none", uptime: null },
    { day: "2026-09-27", state: "partial", uptime: 50 },
  ]);
});

test("uptimeOver weights by checks and ignores days before the window", () => {
  const rows = [
    { day: "2026-09-01", pings: 10, ok: 0 },
    { day: "2026-09-26", pings: 3, ok: 3 },
    { day: "2026-09-27", pings: 1, ok: 0 },
  ];
  assert.equal(uptimeOver(rows, 7, NOW), 75);
  assert.equal(uptimeOver(rows, 30, NOW), 21.4);
  assert.equal(uptimeOver([], 7, NOW), null);
});

test("span reads like a person would say it", () => {
  assert.equal(span(20_000), "1m");
  assert.equal(span(45 * 60_000), "45m");
  assert.equal(span(125 * 60_000), "2h 5m");
  assert.equal(span(3 * 86_400_000 + 3_600_000), "3d 1h");
  assert.equal(span(2 * 86_400_000), "2d");
});
