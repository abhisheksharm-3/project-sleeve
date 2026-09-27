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

test("mayAttach: own account by id, organisations only for owners", async () => {
  const { mayAttach } = await import("./github-app.ts");
  const me = { id: 7, login: "abhisheksharm-3" };
  const mine = { id: 1, account: "abhisheksharm-3", accountId: 7, accountType: "User" as const };
  const renamed = { ...mine, account: "old-name" };
  const theirs = { ...mine, accountId: 8, account: "someone" };
  const org = { id: 2, account: "acme", accountId: 99, accountType: "Organization" as const };
  assert.equal(mayAttach(mine, me, null).ok, true);
  assert.equal(mayAttach(renamed, me, null).ok, true);
  assert.equal(mayAttach(theirs, me, null).ok, false);
  assert.equal(mayAttach(org, me, "admin").ok, true);
  assert.equal(mayAttach(org, me, "member").ok, false);
  assert.equal(mayAttach(org, me, "none").ok, false);
  const missing = mayAttach(org, me, "missing_permission");
  assert.equal(missing.ok, false);
  assert.match(missing.ok ? "" : missing.reason, /Members access/);
});
