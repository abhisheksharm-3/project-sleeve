import { assert, assertEquals } from "@std/assert";
import { type Alert, composeEmail } from "./message.ts";

const base: Alert = {
  alert_id: 1,
  kind: "failing",
  email: "dev@example.com",
  project_name: "abhisheksharm-3/biodocs",
  url: "https://xlivxxxyudbfbtsmemxp.supabase.co/rest/v1/rpc/keepalive",
  platform: "supabase",
  last_ok_at: "2026-09-27T09:00:00Z",
  pause_at: "2026-10-04T09:00:00Z",
  failures: 3,
};
const NOW = Date.parse("2026-09-27T12:00:00Z");
const SITE = "https://projectsleeve.vercel.app";

Deno.test("failing: names the project, the streak and the deadline", () => {
  const m = composeEmail(base, SITE, NOW);
  assertEquals(m.to, "dev@example.com");
  assertEquals(m.subject, "biodocs: keep-alive is failing");
  assert(m.text.includes("3 pings in a row"));
  assert(m.text.includes("6d 21h"), m.text);
  assert(m.text.includes(`${SITE}/dashboard`));
});

Deno.test("pause_soon: says how long is left", () => {
  const m = composeEmail(
    { ...base, kind: "pause_soon", pause_at: "2026-09-28T10:00:00Z" },
    SITE,
    NOW,
  );
  assertEquals(m.subject, "biodocs may pause within 48 hours");
  assert(m.text.includes("22h"), m.text);
});

Deno.test("paused: is honest that keep-alive cannot resume it", () => {
  const m = composeEmail({ ...base, kind: "paused", pause_at: "2026-09-27T10:00:00Z" }, SITE, NOW);
  assertEquals(m.subject, "biodocs has probably paused");
  assert(m.text.includes("cannot resume"));
});

Deno.test("never includes the target's secret or response data", () => {
  const m = composeEmail(base, SITE, NOW);
  assertEquals(Object.keys(m).sort(), ["subject", "text", "to"]);
});
