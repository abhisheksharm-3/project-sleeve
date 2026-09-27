import assert from "node:assert/strict";
import { test } from "node:test";
import { appwriteRowUrl, isAppwriteId } from "./appwrite.ts";

test("appwriteRowUrl builds the heartbeat row URL inside the user's own database", () => {
  const row = "/v1/tablesdb/main-db/tables/6ab8dfa1000b5b01b1b1/rows/sleeve";
  assert.equal(
    appwriteRowUrl("https://fra.cloud.appwrite.io/v1", "main-db", "6ab8dfa1000b5b01b1b1"),
    `https://fra.cloud.appwrite.io${row}`,
  );
  assert.equal(
    appwriteRowUrl("https://cloud.appwrite.io/v1", " main-db ", " 6ab8dfa1000b5b01b1b1 "),
    `https://cloud.appwrite.io${row}`,
  );
});

test("appwriteRowUrl refuses anything that is not Appwrite Cloud over https", () => {
  for (const bad of [
    "http://fra.cloud.appwrite.io/v1",
    "https://evil.com/v1",
    "https://cloud.appwrite.io.evil.com",
    "https://appwrite.mycompany.com/v1",
    "nope",
  ]) {
    assert.equal(appwriteRowUrl(bad, "main-db", "t1"), null, bad);
  }
});

test("appwriteRowUrl refuses a malformed database id, so it cannot rewrite the path", () => {
  assert.equal(appwriteRowUrl("https://fra.cloud.appwrite.io/v1", "../../users", "t1"), null);
  assert.equal(appwriteRowUrl("https://fra.cloud.appwrite.io/v1", "main-db", "../rows"), null);
});

test("isAppwriteId accepts project ids and refuses junk", () => {
  assert.equal(isAppwriteId("6523f1a2b3c4d5e6f7a8"), true);
  assert.equal(isAppwriteId("my-project"), true);
  assert.equal(isAppwriteId("-leading"), false);
  assert.equal(isAppwriteId("has space"), false);
  assert.equal(isAppwriteId("x".repeat(37)), false);
});
