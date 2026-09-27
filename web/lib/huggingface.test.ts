import assert from "node:assert/strict";
import { test } from "node:test";
import { cadenceForSpace, parseSpaceId, resolveSpace } from "./huggingface.ts";

test("parseSpaceId accepts ids and Space page URLs", () => {
  assert.equal(parseSpaceId("gradio/hello_world"), "gradio/hello_world");
  assert.equal(
    parseSpaceId("https://huggingface.co/spaces/gradio/hello_world"),
    "gradio/hello_world",
  );
  assert.equal(
    parseSpaceId("https://huggingface.co/spaces/gradio/hello_world/"),
    "gradio/hello_world",
  );
});

test("parseSpaceId refuses junk, traversal and hf.space subdomains", () => {
  for (const bad of [
    "gradio",
    "a/b/c",
    "../etc/passwd",
    "gradio/../x",
    "https://gradio-hello-world.hf.space",
    "",
  ]) {
    assert.equal(parseSpaceId(bad), null, bad);
  }
});

test("resolveSpace reads the domain and sleep window from the runtime record", async () => {
  const fake = (async () =>
    Response.json({
      stage: "SLEEPING",
      gcTimeout: 86400,
      domains: [{ domain: "gradio-hello-world.hf.space", stage: "READY" }],
    })) as unknown as typeof fetch;
  assert.deepEqual(await resolveSpace("gradio/hello_world", fake), {
    id: "gradio/hello_world",
    url: "https://gradio-hello-world.hf.space/",
    stage: "SLEEPING",
    sleepSeconds: 86400,
  });
  const missing = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  assert.equal(await resolveSpace("nope/nope", missing), null);
});

test("cadenceForSpace halves the sleep window and never exceeds the fallback", () => {
  assert.equal(cadenceForSpace(86400, 21600), 21600);
  assert.equal(cadenceForSpace(3600, 21600), 1800);
  assert.equal(cadenceForSpace(null, 21600), 21600);
});
