import { expect, seedProject, test } from "./fixtures";

test("a scheduled job pings in, then reports a failure", async ({ signedIn: page, user }) => {
  const project = await seedProject(user.id, "e2e-jobs");
  await page.goto(`/projects/${project}?add=heartbeat#add`);
  await page.getByLabel("Name").fill("Nightly backup");
  await page.getByLabel("It runs").selectOption("3600");
  await page.getByRole("button", { name: "Create heartbeat" }).click();
  await expect(page.getByRole("status")).toContainText("Add the curl line");
  await expect(page.getByRole("heading", { name: "Nightly backup" })).toBeVisible();
  await expect(page.getByText("Waiting for the first ping from your job.")).toBeVisible();

  const curl = (await page.locator("pre", { hasText: "curl -fsS" }).textContent()) ?? "";
  const url = curl.split(" ").pop()?.trim() ?? "";
  expect(url).toMatch(/\/h\/[A-Za-z0-9_-]{32,64}$/);
  const path = new URL(url).pathname;

  expect((await page.request.post(path)).status()).toBe(200);
  await page.reload();
  await expect(page.getByText("Pinging on schedule.")).toBeVisible();

  expect((await page.request.get(`${path}/fail`)).status()).toBe(200);
  await page.reload();
  await expect(
    page.getByText(/No ping arrived when one was due, or the job reported a failure/),
  ).toBeVisible();
});

test("an unknown heartbeat token is a plain 404", async ({ request }) => {
  expect((await request.get(`/h/${"x".repeat(43)}`)).status()).toBe(404);
  expect((await request.get("/h/short")).status()).toBe(404);
});
