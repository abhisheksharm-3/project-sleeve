import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { composeDigest, type DigestBackend } from "./message.ts";

const NOW = Date.parse("2026-09-28T08:00:00Z");
const SITE = "https://projectsleeve.vercel.app";
const db: DigestBackend = {
  project: "abhisheksharm-3/biodocs",
  platform: "supabase",
  pings7: 28,
  ok7: 28,
  failuresSinceOk: 0,
  pauseAt: "2026-10-04T08:00:00Z",
  pauseWindowSeconds: 604_800,
};

Deno.test("a quiet week: totals and the closest deadline", () => {
  const text = composeDigest([db], [], SITE, NOW) ?? "";
  assertStringIncludes(text, "1 backend, 100% of checks passed");
  assertStringIncludes(text, "Closest to pausing: biodocs Supabase database, 6d 0h");
  assert(!text.includes("Needs you"));
});

Deno.test("trouble and stopped workflows are listed; Render's short window is not a deadline", () => {
  const render = {
    ...db,
    project: "x/quickgist",
    platform: "render",
    pauseAt: "2026-09-28T08:10:00Z",
    pauseWindowSeconds: 900,
  };
  const failing = {
    ...db,
    project: "x/kalendar",
    platform: "appwrite",
    ok7: 20,
    failuresSinceOk: 3,
  };
  const paused = { ...db, project: "x/old", pauseAt: "2026-09-27T00:00:00Z" };
  const text = composeDigest(
    [render, failing, paused],
    [{
      project: "x/resummarize",
      name: "Keep alive",
      state: "disabled_inactivity",
      lastRunAt: "2026-03-13T00:00:00Z",
    }],
    SITE,
    NOW,
  ) ?? "";
  assertStringIncludes(text, "x/old".split("/")[1] + " Supabase database has probably paused");
  assertStringIncludes(text, "kalendar Appwrite project: 3 checks in a row have failed");
  assertStringIncludes(text, 'resummarize: "Keep alive", last ran Fri Mar 13 2026');
  assertStringIncludes(text, "Closest to pausing: kalendar");
});

Deno.test("nothing to say, nothing sent", () => {
  assertEquals(
    composeDigest([], [{ project: "a/b", name: "w", state: "active", lastRunAt: null }], SITE, NOW),
    null,
  );
});
