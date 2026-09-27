/**
 * The Supabase Management API calls behind one-click setup: exchange the OAuth code, list
 * projects, read the public key, install keepalive(), and restore a paused project. The
 * access token is used for these and never stored; the refresh token is kept only when the
 * user opts into auto-restore.
 */
import { isPublicSupabaseKey } from "./supabase-key.ts";
import { KEEPALIVE_SQL } from "./target-url.ts";

const API = "https://api.supabase.com";

export type SupabaseProject = { ref: string; name: string; status: string; region: string };
type ApiKey = { name: string; type: string; api_key: string | null };

export async function exchangeCode(
  args: {
    code: string;
    verifier: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  },
  fetchFn: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const res = await fetchFn(`${API}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${args.clientId}:${args.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
      code_verifier: args.verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase refused the sign-in (${res.status}).`);
  const body = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!body.access_token) throw new Error("Supabase returned no access token.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null };
}

function call(token: string, path: string, init: RequestInit, fetchFn: typeof fetch) {
  return fetchFn(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export async function listProjects(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<SupabaseProject[]> {
  const res = await call(token, "/v1/projects", {}, fetchFn);
  if (!res.ok) throw new Error(`Could not list your Supabase projects (${res.status}).`);
  return ((await res.json()) as SupabaseProject[]).map(({ ref, name, status, region }) => ({
    ref,
    name,
    status,
    region,
  }));
}

/**
 * A publishable key if the project has one, else the legacy anon key. The same list holds the
 * service-role and secret keys; the result is re-checked so neither can ever be returned.
 */
export function pickPublicKey(keys: ApiKey[]): string | null {
  const choice =
    keys.find((k) => k.type === "publishable" && k.api_key)?.api_key ??
    keys.find((k) => k.type === "legacy" && k.name === "anon" && k.api_key)?.api_key ??
    null;
  return choice && isPublicSupabaseKey(choice) ? choice : null;
}

export async function publicKey(
  token: string,
  ref: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const res = await call(token, `/v1/projects/${ref}/api-keys?reveal=true`, {}, fetchFn);
  if (!res.ok) throw new Error(`Could not read that project's keys (${res.status}).`);
  return pickPublicKey((await res.json()) as ApiKey[]);
}

/** Runs exactly the snippet a user would paste by hand, and nothing else. */
export async function installKeepalive(
  token: string,
  ref: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await call(
    token,
    `/v1/projects/${ref}/database/query`,
    { method: "POST", body: JSON.stringify({ query: KEEPALIVE_SQL }) },
    fetchFn,
  );
  if (!res.ok) throw new Error(`Could not install keepalive() (${res.status}).`);
}

/** Asks Supabase to bring a paused project back. It takes a few minutes to come up. */
export async function restoreProject(
  token: string,
  ref: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await call(token, `/v1/projects/${ref}/restore`, { method: "POST" }, fetchFn);
  if (!res.ok) throw new Error(`Supabase would not restore that project (${res.status}).`);
}
