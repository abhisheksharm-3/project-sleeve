import { expect, seedProject, test } from "./fixtures";

test("an API token adds and removes backends, and stops working once revoked", async ({
  signedIn: page,
  user,
  newUser,
}) => {
  const project = await seedProject(user.id, "e2e-api");
  const other = await newUser();
  const theirs = await seedProject(other.id, "e2e-api-theirs");

  await page.goto("/api-tokens");
  await page.getByLabel("Token name").fill("E2E CI");
  await page.getByRole("button", { name: "Create token" }).click();
  const token = (await page.getByRole("status").locator("pre").textContent())?.trim() ?? "";
  expect(token).toMatch(/^sleeve_/);
  const auth = { authorization: `Bearer ${token}` };
  const api = page.request;

  expect((await api.get("/api/v1/projects")).status()).toBe(401);
  const listed = await (await api.get("/api/v1/projects", { headers: auth })).json();
  expect(listed.projects.map((p: { name: string }) => p.name)).toEqual(["e2e-api"]);

  const made = await api.post("/api/v1/targets", {
    headers: auth,
    data: { project_id: project, kind: "website", url: "https://example.com/" },
  });
  expect(made.status()).toBe(201);
  expect((await made.json()).kind).toBe("website");

  const privateUrl = await api.post("/api/v1/targets", {
    headers: auth,
    data: { project_id: project, kind: "website", url: "http://169.254.169.254/latest" },
  });
  expect(privateUrl.status()).toBe(400);

  const foreign = await api.post("/api/v1/targets", {
    headers: auth,
    data: { project_id: theirs, kind: "website", url: "https://example.com/" },
  });
  expect(foreign.status()).toBe(404);

  const beat = await (
    await api.post("/api/v1/targets", {
      headers: auth,
      data: { project_id: project, kind: "heartbeat", label: "CI job", interval_seconds: 3600 },
    })
  ).json();
  expect(beat.ping_url).toMatch(/\/h\/[A-Za-z0-9_-]{43}$/);

  const removed = await (
    await api.delete(`/api/v1/targets?url=${encodeURIComponent("https://example.com/")}`, {
      headers: auth,
    })
  ).json();
  expect(removed.removed).toHaveLength(1);
  expect((await api.delete(`/api/v1/targets/${beat.id}`, { headers: auth })).status()).toBe(204);

  await page.reload();
  await expect(page.getByText(/Used .* ago|Used just now/).first()).toBeVisible();
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  expect((await api.get("/api/v1/projects", { headers: auth })).status()).toBe(401);
});
