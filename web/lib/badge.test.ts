import assert from "node:assert/strict";
import { test } from "node:test";
import { badgeSvg, barsSvg } from "./badge.ts";

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

test("barsSvg draws one rect per day, escapes labels, and caps the rows", () => {
  const row = { label: "a <b> & c", cells: Array(90).fill("up"), uptime: "100%" } as const;
  const svg = barsSvg("My apps", "Everything is up.", "#f4b860", [row]);
  assert.equal(svg.match(/<rect x=/g)?.length, 90);
  assert.match(svg, /a &lt;b&gt; &amp; c/);
  const many = barsSvg("x", "y", "#fff", Array(10).fill({ ...row, cells: ["up"] }));
  assert.match(many, /and 2 more on the status page/);
});
