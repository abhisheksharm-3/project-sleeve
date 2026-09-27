import assert from "node:assert/strict";
import { test } from "node:test";
import { affectsScan } from "./repo-scan.ts";

test("affectsScan: config files and workflows count, everything else does not", () => {
  assert.equal(affectsScan(["render.yaml"]), true);
  assert.equal(affectsScan(["src/app.ts", ".env.example"]), true);
  assert.equal(affectsScan([".github/workflows/keepalive.yml"]), true);
  assert.equal(affectsScan(["src/app.ts", "docs/render.yaml"]), false);
  assert.equal(affectsScan([]), false);
});
