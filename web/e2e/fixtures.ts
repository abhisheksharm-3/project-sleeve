/**
 * A signed-in page per test, backed by a throwaway user. The user is created with the admin
 * API, signed in with a password, handed to the browser as the Supabase session cookie, and
 * deleted afterwards; the database cascades everything they made.
 */
import { randomBytes } from "node:crypto";
import { test as base, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = new URL(url).hostname.split(".")[0];
const CHUNK = 3_000;

export const admin: SupabaseClient = createClient(
  url,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  {
    auth: { persistSession: false },
  },
);

export type TestUser = { id: string; email: string };

async function createUser(): Promise<TestUser & { password: string }> {
  const email = `e2e-${randomBytes(6).toString("hex")}@sleeve.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { user_name: `e2e-${randomBytes(3).toString("hex")}` },
  });
  if (error || !data.user) throw error ?? new Error("could not create the test user");
  return { id: data.user.id, email, password };
}

async function signIn(page: Page, email: string, password: string) {
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("could not sign the test user in");
  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  const chunks = value.match(new RegExp(`.{1,${CHUNK}}`, "g")) ?? [];
  const name = `sb-${ref}-auth-token`;
  await page.context().addCookies(
    chunks.map((c, i) => ({
      name: chunks.length === 1 ? name : `${name}.${i}`,
      value: c,
      domain: "localhost",
      path: "/",
      sameSite: "Lax" as const,
    })),
  );
}

export const test = base.extend<{
  user: TestUser;
  signedIn: Page;
  newUser: () => Promise<TestUser & { page: Page }>;
}>({
  user: async ({ page }, use) => {
    const u = await createUser();
    await signIn(page, u.email, u.password);
    await use({ id: u.id, email: u.email });
    await admin.auth.admin.deleteUser(u.id);
  },
  signedIn: async ({ page, user }, use) => {
    void user;
    await use(page);
  },
  newUser: async ({ browser }, use) => {
    const made: string[] = [];
    await use(async () => {
      const u = await createUser();
      made.push(u.id);
      const page = await (await browser.newContext({ baseURL: "http://localhost:3000" })).newPage();
      await signIn(page, u.email, u.password);
      return { id: u.id, email: u.email, page };
    });
    for (const id of made) await admin.auth.admin.deleteUser(id);
  },
});

export { expect } from "@playwright/test";

/** A project made directly in the database for the user, skipping the GitHub import. */
export async function seedProject(userId: string, name: string): Promise<string> {
  const { data, error } = await admin
    .from("projects")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("could not seed the project");
  return data.id;
}
