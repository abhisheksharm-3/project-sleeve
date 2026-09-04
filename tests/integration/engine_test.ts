import { assertEquals } from "@std/assert";
import { getServiceClient } from "../helpers/db.ts";

Deno.test("schema: engine tables exist and are queryable", async () => {
  const db = getServiceClient();
  for (const table of ["targets", "jobs", "ping_log", "pause_events"]) {
    const { error } = await db.from(table).select("*").limit(0);
    assertEquals(error, null, `table ${table} should be queryable`);
  }
});
