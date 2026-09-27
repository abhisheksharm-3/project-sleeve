import { admin, expect, seedProject, test } from "./fixtures";

async function seedBackend(projectId: string) {
  const { data, error } = await admin
    .from("targets")
    .insert({
      project_id: projectId,
      platform: "custom",
      url: "https://example.com/",
      heartbeat_type: "plain",
      interval_seconds: 86_400,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("could not seed the backend");
  await admin
    .from("ping_log")
    .insert({ target_id: data.id, ok: true, status_code: 200, latency_ms: 120 });
  return data.id;
}

test("build, publish and share a status page", async ({ signedIn: page, user, browser }) => {
  const project = await seedProject(user.id, "e2e/status-demo");
  await seedBackend(project);
  const slug = `e2e-${Date.now().toString(36)}`;

  await page.goto("/status-pages");
  await page.getByLabel(/Make your first page/).fill("E2E status");
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E status");

  await page.getByLabel("Address").fill(slug);
  await page.getByRole("checkbox", { name: "Website" }).check();
  await page.getByLabel("Name shown for Website").fill("Demo API");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");

  const visitor = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
  expect((await visitor.goto(`/s/${slug}`))?.status()).toBe(404);
  await page.goto(`/s/${slug}`);
  await expect(page.getByText("Draft. Only you can see this page")).toBeVisible();

  await page.goBack();
  await page.getByRole("button", { name: "Publish page" }).click();
  await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();

  await visitor.goto(`/s/${slug}`);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("E2E status");
  await expect(visitor.getByRole("heading", { name: "Demo API" })).toBeVisible();
  await expect(visitor.getByText("Everything is up.").first()).toBeVisible();
  await expect(visitor.getByText("example.com")).toHaveCount(0);

  const bars = await visitor.request.get(`/s/${slug}/bars.svg`);
  expect(await bars.text()).toContain("Demo API");
  const badge = await visitor.request.get(`/s/${slug}/badge.svg`);
  expect(await badge.text()).toContain("status: up");
  const og = await visitor.request.get(`/s/${slug}/opengraph-image`);
  expect(og.headers()["content-type"]).toBe("image/png");

  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByRole("button", { name: "Publish page" })).toBeVisible();
  expect((await visitor.goto(`/s/${slug}`))?.status()).toBe(404);
});

test("a status page cannot show someone else's backend", async ({
  signedIn: page,
  user,
  newUser,
}) => {
  const other = await newUser();
  const theirs = await seedBackend(await seedProject(other.id, "e2e/theirs"));
  await page.goto("/status-pages");
  await page.getByLabel(/Make your first page/).fill("E2E forged");
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E forged");
  const pageId = new URL(page.url()).pathname.split("/").pop() ?? "";

  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save changes" }) });
  await form.evaluate((f, id) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "target";
    input.value = id;
    f.appendChild(input);
  }, theirs);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Saved.");

  const { data } = await admin.from("status_page_items").select("target_id").eq("page_id", pageId);
  expect(data).toEqual([]);
  void user;
});
