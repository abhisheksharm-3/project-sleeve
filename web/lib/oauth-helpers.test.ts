import assert from "node:assert/strict";
import { test } from "node:test";
import { challengeFor, newVerifier } from "./pkce.ts";
import { seal, unseal } from "./sealed.ts";

test("PKCE challenge matches the RFC 7636 appendix B example", () => {
  assert.equal(
    challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
  assert.match(newVerifier(), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(newVerifier(), newVerifier());
});

test("sealed values round-trip and refuse tampering or the wrong key", () => {
  const s = seal({ token: "abc", state: "xyz" }, "k1");
  assert.deepEqual(unseal(s, "k1"), { token: "abc", state: "xyz" });
  assert.equal(unseal(s, "k2"), null);
  const [iv, tag, body] = s.split(".");
  const flipped = `${iv}.${tag}.${body.slice(0, -2)}${body.at(-2) === "A" ? "B" : "A"}${body.at(-1)}`;
  assert.equal(unseal(flipped, "k1"), null);
  assert.equal(unseal("junk", "k1"), null);
  assert.equal(unseal(undefined, "k1"), null);
});
