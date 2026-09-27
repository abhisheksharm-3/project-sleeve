import assert from "node:assert/strict";
import { test } from "node:test";
import { badgeSvg } from "./badge.ts";

test("badgeSvg is valid-looking SVG with both halves", () => {
  const svg = badgeSvg("kept awake", "99.8%", "#f4b860");
  assert.match(svg, /^<svg /);
  assert.match(svg, />kept awake</);
  assert.match(svg, />99\.8%</);
});

test("badgeSvg escapes text, so a name cannot inject markup", () => {
  const svg = badgeSvg('<script>alert("x")</script>', "&", "#000");
  assert.equal(svg.includes("<script>"), false);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, />&amp;</);
});
