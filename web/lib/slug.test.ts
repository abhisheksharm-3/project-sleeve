import assert from "node:assert/strict";
import { test } from "node:test";
import { isSlug, slugify } from "./slug.ts";

test("isSlug matches the database check", () => {
  assert.equal(isSlug("abhishek"), true);
  assert.equal(isSlug("my-apps-2"), true);
  assert.equal(isSlug("ab"), false);
  assert.equal(isSlug("-abc"), false);
  assert.equal(isSlug("abc-"), false);
  assert.equal(isSlug("ABC"), false);
  assert.equal(isSlug("a".repeat(41)), false);
});

test("slugify turns a title into an address, or gives up cleanly", () => {
  assert.equal(slugify("Abhishek's Side Projects"), "abhishek-s-side-projects");
  assert.equal(slugify("  Café Status!  "), "cafe-status");
  assert.equal(slugify("!!"), "");
  assert.equal(isSlug(slugify(`${"word ".repeat(20)}`)), true);
});
