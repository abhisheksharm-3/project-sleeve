import { admin, expect, test } from "./fixtures";

test("only Discord and Slack webhooks are accepted", async ({ signedIn: page, user }) => {
  await page.goto("/notifications");
  const field = page.getByLabel("Webhook URL");

  await field.fill("https://evil.example/api/webhooks/1/abc");
  await page.getByRole("button", { name: "Save webhook" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Discord or Slack" })).toBeVisible();

  await field.fill("https://discord.com/api/webhooks/123456/e2e-token");
  await page.getByLabel(/Monday digest/).uncheck();
  await page.getByRole("button", { name: "Save webhook" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");

  const { data } = await admin
    .from("notification_channels")
    .select("kind, alerts, digest")
    .eq("user_id", user.id)
    .single();
  expect(data).toEqual({ kind: "discord", alerts: true, digest: false });

  await page.getByRole("button", { name: "Remove webhook" }).click();
  await expect(page.getByRole("status")).toContainText("Webhook removed.");
});
