import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseAtlas, parseAtlasUri } from "./mongodb.ts";

test("parseAtlasUri takes Atlas SRV strings with credentials and nothing else", () => {
  const good = "mongodb+srv://sleeve:s3cret@cluster0.abcde.mongodb.net/?appName=Cluster0";
  assert.deepEqual(parseAtlasUri(good), { uri: good, host: "cluster0.abcde.mongodb.net" });
  assert.equal(parseAtlasUri("mongodb+srv://cluster0.abcde.mongodb.net/"), null);
  assert.equal(parseAtlasUri("mongodb://u:p@cluster0.abcde.mongodb.net:27017/"), null);
  assert.equal(parseAtlasUri("mongodb+srv://u:p@evil.test/"), null);
  assert.equal(parseAtlasUri("mongodb+srv://u:p@mongodb.net.evil.test/"), null);
  assert.equal(parseAtlasUri("https://u:p@cluster0.abcde.mongodb.net/"), null);
  assert.equal(parseAtlasUri("not a uri"), null);
});

test("diagnoseAtlas names the fix", () => {
  assert.match(diagnoseAtlas("bad auth : authentication failed"), /username or password/);
  assert.match(diagnoseAtlas("querySrv ENOTFOUND _mongodb._tcp.x"), /No Atlas cluster/);
  assert.match(diagnoseAtlas("Server selection timed out after 8000 ms"), /0\.0\.0\.0\/0/);
});
