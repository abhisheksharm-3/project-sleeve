/**
 * GitHub App access for private repositories. The user picks which repositories to share
 * when installing; the app asks for read-only Metadata, Contents and Actions, and can
 * never write.
 */
import { createSign } from "node:crypto";

const API = "https://api.github.com";

/** The app's own 10-minute JWT (RS256), backdated a minute for clock drift as GitHub advises. */
export function appJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId })}`;
  const signature = createSign("RSA-SHA256").update(body).sign(privateKeyPem).toString("base64url");
  return `${body}.${signature}`;
}

/** Keys pasted into an env var often arrive with literal \n; restore real newlines. */
export function normalisePem(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
}

export type Installation = { id: number; account: string };

export async function getInstallation(
  jwt: string,
  id: number,
  fetchFn: typeof fetch = fetch,
): Promise<Installation | null> {
  const res = await fetchFn(`${API}/app/installations/${id}`, {
    headers: headers(jwt),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    id: number;
    account: { login: string };
  };
  return { id: body.id, account: body.account.login };
}

export async function installationToken(
  jwt: string,
  id: number,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(`${API}/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: headers(jwt),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub refused the app token (${res.status}).`);
  return ((await res.json()) as { token: string }).token;
}

export type AppRepo = {
  id: number;
  full_name: string;
  html_url: string;
  language: string | null;
  pushed_at: string | null;
  archived: boolean;
  fork: boolean;
  private: boolean;
};

const MAX_PAGES = 5;

/** ponytail: stops at 500 repositories per installation; page further if one grants more. */
export async function installationRepos(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppRepo[]> {
  const repos: AppRepo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchFn(`${API}/installation/repositories?per_page=100&page=${page}`, {
      headers: headers(token),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status} listing the app's repositories.`);
    const batch = ((await res.json()) as { repositories: AppRepo[] }).repositories;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}
