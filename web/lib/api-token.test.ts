import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerToken, hashToken, newToken } from "./api-token.ts";

test("newToken: a readable prefix, and a hash that matches the token", () => {
  const t = newToken();
  assert.match(t.token, /^sleeve_[A-Za-z0-9_-]{43}$/);
  assert.equal(t.hash, hashToken(t.token));
  assert.equal(t.prefix, t.token.slice(0, 13));
  assert.notEqual(newToken().token, t.token);
});

test("bearerToken reads only our tokens from the header", () => {
  const { token } = newToken();
  assert.equal(bearerToken(`Bearer ${token}`), token);
  assert.equal(bearerToken(`bearer ${token}`), token);
  assert.equal(bearerToken(token), null);
  assert.equal(bearerToken("Bearer sleeve_short"), null);
  assert.equal(bearerToken("Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"), null);
  assert.equal(bearerToken(null), null);
});
