import assert from "node:assert/strict";
import { test } from "node:test";
import { extractFindings, looksLikeKeepAlive } from "./repo-findings.ts";

test("finds a Supabase project URL in an env example, once", () => {
  const f = extractFindings({
    ".env.example":
      "NEXT_PUBLIC_SUPABASE_URL=https://nujgeowsnjculknvimbh.supabase.co\nX=https://nujgeowsnjculknvimbh.supabase.co/rest/v1",
  });
  assert.deepEqual(f.supabase, [
    { url: "https://nujgeowsnjculknvimbh.supabase.co", source: ".env.example" },
  ]);
});

test("ignores placeholder Supabase URLs", () => {
  const f = extractFindings({
    ".env.example":
      "SUPABASE_URL=https://your-project.supabase.co\nB=https://xxxxxxxxxxxxxxxxxxxx.supabase.co",
  });
  assert.deepEqual(f.supabase, []);
});

test("finds Appwrite endpoint and project id together", () => {
  const f = extractFindings({
    ".env.example":
      "APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1\nAPPWRITE_PROJECT_ID=66a4c1820020c6133651",
  });
  assert.deepEqual(f.appwrite, [
    {
      endpoint: "https://fra.cloud.appwrite.io/v1",
      projectId: "66a4c1820020c6133651",
      source: ".env.example",
    },
  ]);
});

test("reads Render web services from render.yaml, skipping workers and databases", () => {
  const f = extractFindings({
    "render.yaml":
      "services:\n  - type: web\n    name: notes-api\n    env: node\n  - type: worker\n    name: queue\ndatabases:\n  - name: notes-db\n",
  });
  assert.deepEqual(f.render, [{ url: "https://notes-api.onrender.com", source: "render.yaml" }]);
});

test("finds Hugging Face Space links in a README", () => {
  const f = extractFindings({
    "README.md":
      "Try it at https://huggingface.co/spaces/abhi/sentiment-demo or the [demo](https://huggingface.co/spaces/abhi/sentiment-demo).",
  });
  assert.deepEqual(f.huggingface, [{ id: "abhi/sentiment-demo", source: "README.md" }]);
});

test("looksLikeKeepAlive wants a schedule and a ping-shaped job", () => {
  const ping =
    "on:\n  schedule:\n    - cron: '0 9 * * 1,3,5'\njobs:\n  ping:\n    steps:\n      - run: curl \"$SUPABASE_URL/rest/v1/\"";
  assert.equal(looksLikeKeepAlive(ping), true);
  assert.equal(
    looksLikeKeepAlive("on:\n  push:\njobs:\n  test:\n    steps:\n      - run: curl https://x"),
    false,
  );
  assert.equal(
    looksLikeKeepAlive(
      "on:\n  schedule:\n    - cron: '0 0 * * 0'\njobs:\n  release:\n    steps:\n      - run: npm publish",
    ),
    false,
  );
});

test("extractFindings: Atlas hosts without their credentials, and Koyeb services", () => {
  const f = extractFindings({
    ".env.example":
      "MONGODB_URI=mongodb+srv://admin:hunter2@cluster0.ab1cd.mongodb.net/app\nPLACEHOLDER=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net\nAPI=https://quickgist-api-abhi.koyeb.app/health",
  });
  assert.deepEqual(f.mongodb, [{ host: "cluster0.ab1cd.mongodb.net", source: ".env.example" }]);
  assert.equal(JSON.stringify(f).includes("hunter2"), false);
  assert.deepEqual(f.koyeb, [
    { url: "https://quickgist-api-abhi.koyeb.app", source: ".env.example" },
  ]);
});
