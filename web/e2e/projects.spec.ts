import { expect, seedProject, test } from "./fixtures";

test("a new user starts on an empty dashboard", async ({ signedIn: page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No lights on yet.");
  await expect(
    page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Projects" }),
  ).toHaveAttribute("aria-current", "page");
});

test("create a project by hand, add a backend, and find it on the dashboard", async ({
  signedIn: page,
}) => {
  await page.goto("/import");
  await page.getByLabel("Project name").fill("e2e-side-project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e-side-project");

  await page.getByRole("link", { name: /Something else/ }).click();
  await page.getByLabel("URL").fill("https://example.com/");
  await page.getByLabel("What should the check do?").selectOption("plain");
  await page.getByRole("button", { name: "Add backend" }).click();
  await expect(page.getByRole("status")).toContainText("first check passed");
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Projects" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The light is on.");
  const search = page.getByLabel("Search projects");
  await search.fill("side-project");
  await expect(page.getByRole("link", { name: "e2e-side-project" })).toBeVisible();
  await search.fill("nothing-matches-this");
  await expect(page.getByText("No project or backend matches that.")).toBeVisible();
});

test("a backend on a private address is refused", async ({ signedIn: page, user }) => {
  const id = await seedProject(user.id, "e2e-ssrf");
  await page.goto(`/projects/${id}?add=custom#add`);
  await page.getByLabel("URL").fill("http://127.0.0.1:5432/");
  await page.getByRole("button", { name: "Add backend" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not saved." })).toBeVisible();
});

test("one user cannot open another user's project", async ({ signedIn: page, newUser }) => {
  const other = await newUser();
  const theirs = await seedProject(other.id, "e2e-someone-else");
  const res = await page.goto(`/projects/${theirs}`);
  expect(res?.status()).toBe(404);
  await other.page.goto(`/projects/${theirs}`);
  await expect(other.page.getByRole("heading", { level: 1 })).toHaveText("e2e-someone-else");
});

test("the account menu signs out", async ({ signedIn: page }) => {
  await page.goto("/dashboard");
  await page.locator("header summary").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
