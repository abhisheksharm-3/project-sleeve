import assert from "node:assert/strict";
import { test } from "node:test";
import { cadenceFloor, clampCadence } from "./cadence.ts";

const FREE = { min_interval_seconds: 21600, platform_min_interval_seconds: { render: 600, huggingface: 600 } };

test("a platform floor replaces the plan floor", () => {
  assert.equal(cadenceFloor(FREE, "render"), 600);
  assert.equal(cadenceFloor(FREE, "supabase"), 21600);
  assert.equal(cadenceFloor(FREE), 21600);
  assert.equal(cadenceFloor({ min_interval_seconds: 21600 }, "render"), 21600);
});

test("clampCadence keeps Render at 10 minutes and raises anything below a floor", () => {
  assert.equal(clampCadence(FREE, 600, "render"), 600);
  assert.equal(clampCadence(FREE, 60, "render"), 600);
  assert.equal(clampCadence(FREE, 600, "supabase"), 21600);
  assert.equal(clampCadence(FREE, 43200, "supabase"), 43200);
});
