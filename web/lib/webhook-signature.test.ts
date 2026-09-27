import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { validSignature } from "./webhook-signature.ts";

test("validSignature accepts GitHub's signature and nothing else", () => {
  const body = '{"zen":"Keep it logically awesome."}';
  const good = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
  assert.equal(validSignature(body, good, "s3cret"), true);
  assert.equal(validSignature(`${body} `, good, "s3cret"), false);
  assert.equal(validSignature(body, good, "other"), false);
  assert.equal(validSignature(body, null, "s3cret"), false);
  assert.equal(validSignature(body, "sha256=abc", "s3cret"), false);
  assert.equal(validSignature(body, good.replace("sha256=", "sha1="), "s3cret"), false);
});
