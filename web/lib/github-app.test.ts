import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { appJwt, normalisePem } from "./github-app.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

test("appJwt is an RS256 JWT GitHub can verify, backdated and short-lived", () => {
  const jwt = appJwt("12345", pem, 1_800_000_000);
  const [h, p, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), {
    alg: "RS256",
    typ: "JWT",
  });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url").toString()), {
    iat: 1_799_999_940,
    exp: 1_800_000_540,
    iss: "12345",
  });
  assert.equal(
    createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, "base64url")),
    true,
  );
});

test("normalisePem restores newlines from a one-line env var", () => {
  assert.equal(
    normalisePem("-----BEGIN X-----\\nabc\\n-----END X-----"),
    "-----BEGIN X-----\nabc\n-----END X-----",
  );
  assert.equal(normalisePem(pem), pem);
});
