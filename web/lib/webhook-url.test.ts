import assert from "node:assert/strict";
import { test } from "node:test";
import { webhookKind } from "./webhook-url.ts";

test("webhookKind takes Discord and Slack webhooks and nothing else", () => {
  assert.equal(webhookKind("https://discord.com/api/webhooks/123/abc-DEF_9"), "discord");
  assert.equal(webhookKind("https://discordapp.com/api/webhooks/123/abc"), "discord");
  assert.equal(webhookKind("https://hooks.slack.com/services/T0/B0/xyz"), "slack");
  assert.equal(webhookKind("http://discord.com/api/webhooks/1/a"), null);
  assert.equal(webhookKind("https://discord.com.evil.test/api/webhooks/1/a"), null);
  assert.equal(webhookKind("https://evil.test/?u=https://hooks.slack.com/services/a"), null);
  assert.equal(webhookKind("https://discord.com:8443/api/webhooks/1/a"), null);
  assert.equal(webhookKind("https://user@hooks.slack.com/services/a"), null);
  assert.equal(webhookKind("not a url"), null);
});
