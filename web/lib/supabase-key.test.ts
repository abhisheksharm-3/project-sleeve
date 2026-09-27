import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicSupabaseKey } from "./supabase-key.ts";

const jwt = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;

test("accepts anon JWTs and publishable keys", () => {
  assert.equal(isPublicSupabaseKey(jwt("anon")), true);
  assert.equal(isPublicSupabaseKey("sb_publishable_abc123"), true);
});

test("refuses service-role and secret keys, and junk", () => {
  assert.equal(isPublicSupabaseKey(jwt("service_role")), false);
  assert.equal(isPublicSupabaseKey("sb_secret_abc123"), false);
  assert.equal(isPublicSupabaseKey("not-a-key"), false);
  assert.equal(isPublicSupabaseKey("a.%%%.c"), false);
});
