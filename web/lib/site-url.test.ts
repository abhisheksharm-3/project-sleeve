import assert from "node:assert/strict";
import { test } from "node:test";
import { safeRedirect } from "./site-url.ts";

const BASE = "http://localhost:3000";

test("safeRedirect keeps same-origin paths", () => {
  assert.equal(safeRedirect("/dashboard", BASE), "http://localhost:3000/dashboard");
  assert.equal(safeRedirect("/a/b?c=1", BASE), "http://localhost:3000/a/b?c=1");
});

test("safeRedirect refuses protocol-relative and backslash escapes", () => {
  // browsers resolve both of these to a different origin
  assert.equal(safeRedirect("//evil.com", BASE), `${BASE}/`);
  assert.equal(safeRedirect("/\\evil.com", BASE), `${BASE}/`);
  assert.equal(safeRedirect("///evil.com", BASE), `${BASE}/`);
});

test("safeRedirect refuses absolute URLs to other hosts", () => {
  assert.equal(safeRedirect("https://evil.com/x", BASE), `${BASE}/`);
  assert.equal(safeRedirect("http://localhost:3000.evil.com", BASE), `${BASE}/`);
  assert.equal(safeRedirect("javascript:alert(1)", BASE), `${BASE}/`);
});

test("safeRedirect falls back when absent or empty", () => {
  assert.equal(safeRedirect(null, BASE), `${BASE}/`);
  assert.equal(safeRedirect("", BASE), `${BASE}/`);
});

test("safeRedirect leaves an encoded slash as a path, not an origin", () => {
  assert.equal(safeRedirect("/%2F%2Fevil.com", BASE), "http://localhost:3000/%2F%2Fevil.com");
});
