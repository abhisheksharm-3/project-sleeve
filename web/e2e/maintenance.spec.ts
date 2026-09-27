import { admin, expect, seedProject, test } from "./fixtures";

test("maintenance holds a backend and shows on its status page", async ({
  signedIn: page,
  user,
}) => {
  const project = await seedProject(user.id, "e2e/maintained");
  const { data: target } = await admin
    .from("targets")
    .insert({
      project_id: project,
      platform: "custom",
      url: "https://example.com/",
      heartbeat_type: "plain",
      interval_seconds: 86_400,
    })
    .select("id")
    .single();
  await admin.from("ping_log").insert({ target_id: target?.id, ok: true, status_code: 200 });
  const slug = `e2e-m-${Date.now().toString(36)}`;
  const { data: statusPage } = await admin
    .from("status_pages")
    .insert({ user_id: user.id, slug, title: "E2E maintenance", published: true })
    .select("id")
    .single();
  await admin
    .from("status_page_items")
    .insert({ page_id: statusPage?.id, target_id: target?.id, position: 0, label: "Demo API" });

  await page.goto(`/projects/${project}`);
  await page.locator("summary", { hasText: "Maintenance" }).click();
  await page.getByLabel("For").selectOption("3");
  await page.getByLabel("Note, optional").fill("Moving regions");
  await page.getByRole("button", { name: "Start maintenance" }).click();
  await expect(
    page.getByText(/Planned maintenance for another (2h 5\dm|3h): Moving regions/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "End maintenance" })).toBeVisible();

  await page.goto(`/s/${slug}`);
  await expect(page.getByText("Planned maintenance is under way.").first()).toBeVisible();
  await expect(page.getByText("Planned maintenance on Demo API")).toBeVisible();

  await page.goto(`/projects/${project}`);
  await page.getByRole("button", { name: "End maintenance" }).click();
  await expect(page.locator("summary", { hasText: "Maintenance" })).toBeVisible();
  await page.goto(`/s/${slug}`);
  await expect(page.getByText("Everything is up.").first()).toBeVisible();
});
