import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test("landing: the hero and the whole skyline fit the first screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keeping the lights on");
  const tallest = await page.evaluate(() => {
    const buildings = [...document.querySelectorAll("[aria-hidden] .rounded-t-lg")];
    return Math.min(...buildings.map((b) => b.getBoundingClientRect().top));
  });
  expect(tallest).toBeGreaterThanOrEqual(0);
  expect(tallest).toBeLessThan(800);
});

test("sign-in page offers GitHub and previews the dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByLabel("An example of the dashboard")).toContainText(
    "All 4 lights are on.",
  );
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  for (const path of ["/dashboard", "/status-pages", "/notifications", "/import"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("an unknown status page is a 404 and its images stay neutral", async ({ page, request }) => {
  const res = await page.goto("/s/no-such-page-e2e");
  expect(res?.status()).toBe(404);
  const badge = await request.get("/s/no-such-page-e2e/badge.svg");
  expect(badge.status()).toBe(200);
  expect(await badge.text()).toContain("private");
  const bars = await request.get("/s/no-such-page-e2e/bars.svg");
  expect(await bars.text()).toContain("This page is not published.");
});

test("the GitHub webhook accepts only signed deliveries", async ({ request }) => {
  const body = JSON.stringify({ zen: "e2e" });
  const unsigned = await request.post("/api/github/webhook", {
    headers: { "x-github-event": "ping", "content-type": "application/json" },
    data: body,
  });
  expect(unsigned.status()).toBe(401);
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  test.skip(!secret, "GITHUB_APP_WEBHOOK_SECRET is not set locally");
  const signature = `sha256=${createHmac("sha256", secret ?? "")
    .update(body)
    .digest("hex")}`;
  const signed = await request.post("/api/github/webhook", {
    headers: {
      "x-github-event": "ping",
      "x-hub-signature-256": signature,
      "content-type": "application/json",
    },
    data: body,
  });
  expect(signed.status()).toBe(202);
});
