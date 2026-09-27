import { assertEquals, assertStringIncludes } from "@std/assert";
import { actionFor, refFromUrl, restoredMessage } from "./plan.ts";

Deno.test("only a paused project is restored", () => {
  assertEquals(actionFor("INACTIVE"), "restore");
  assertEquals(actionFor("RESTORING"), "wait");
  assertEquals(actionFor("COMING_UP"), "wait");
  assertEquals(actionFor("ACTIVE_HEALTHY"), "leave");
  assertEquals(actionFor("PAUSE_FAILED"), "leave");
});

Deno.test("refFromUrl reads Supabase hosts and nothing else", () => {
  assertEquals(
    refFromUrl("https://vexeafgfbikwqmxwqypi.supabase.co/rest/v1/rpc/keepalive"),
    "vexeafgfbikwqmxwqypi",
  );
  assertEquals(refFromUrl("https://vexeafgfbikwqmxwqypi.supabase.co.evil.test/"), null);
  assertEquals(refFromUrl("https://example.com"), null);
  assertEquals(refFromUrl("nope"), null);
});

Deno.test("the restored message names the project", () => {
  assertStringIncludes(
    restoredMessage("abhisheksharm-3/quickgist", "https://x"),
    "quickgist: Supabase paused it",
  );
});
