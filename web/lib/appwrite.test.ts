import assert from "node:assert/strict";
import { test } from "node:test";
import { appwriteRowUrl, isAppwriteId } from "./appwrite.ts";

test("appwriteRowUrl builds the heartbeat row URL for Cloud endpoints", () => {
  const row = "/v1/tablesdb/sleeve/tables/heartbeats/rows/sleeve";
  assert.equal(
    appwriteRowUrl("https://fra.cloud.appwrite.io/v1"),
    `https://fra.cloud.appwrite.io${row}`,
  );
  assert.equal(appwriteRowUrl("https://cloud.appwrite.io/v1"), `https://cloud.appwrite.io${row}`);
});

test("appwriteRowUrl refuses anything that is not Appwrite Cloud over https", () => {
  for (const bad of [
    "http://fra.cloud.appwrite.io/v1",
    "https://evil.com/v1",
    "https://cloud.appwrite.io.evil.com",
    "https://appwrite.mycompany.com/v1",
    "nope",
  ]) {
    assert.equal(appwriteRowUrl(bad), null, bad);
  }
});

test("isAppwriteId accepts project ids and refuses junk", () => {
  assert.equal(isAppwriteId("6523f1a2b3c4d5e6f7a8"), true);
  assert.equal(isAppwriteId("my-project"), true);
  assert.equal(isAppwriteId("-leading"), false);
  assert.equal(isAppwriteId("has space"), false);
  assert.equal(isAppwriteId("x".repeat(37)), false);
});
