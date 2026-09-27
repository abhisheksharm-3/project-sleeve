/**
 * GitHub App access for private repositories. The user picks which repositories to share
 * when installing; the app asks for read-only Metadata, Contents and Actions, plus
 * organisation Members to confirm an organisation owner, and can never write.
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

export type Installation = {
  id: number;
  account: string;
  accountId: number;
  accountType: "User" | "Organization";
};

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
    account: { login: string; id: number; type: "User" | "Organization" };
  };
  return {
    id: body.id,
    account: body.account.login,
    accountId: body.account.id,
    accountType: body.account.type,
  };
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

export type GitHubUser = { id: number; login: string };

/** Who the token belongs to, from GitHub itself: nothing the user can edit on our side. */
export async function githubUser(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<GitHubUser | null> {
  const res = await fetchFn(`${API}/user`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as GitHubUser;
  return { id: body.id, login: body.login };
}

/**
 * The user's role in an organisation, read with the installation's token, which needs the
 * app's organisation Members permission. "missing_permission" when GitHub refuses that read.
 */
export async function orgRole(
  installationToken: string,
  org: string,
  login: string,
  fetchFn: typeof fetch = fetch,
): Promise<"admin" | "member" | "none" | "missing_permission"> {
  const res = await fetchFn(
    `${API}/orgs/${encodeURIComponent(org)}/memberships/${encodeURIComponent(login)}`,
    { headers: headers(installationToken), cache: "no-store" },
  );
  if (res.status === 403) return "missing_permission";
  if (!res.ok) return "none";
  const body = (await res.json()) as { role: string; state: string };
  if (body.state !== "active") return "none";
  return body.role === "admin" ? "admin" : "member";
}

export type AttachVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Whether this user may attach this installation. Their own account, matched by numeric id
 * so a rename cannot confuse it, or an organisation they own: an owner can see every
 * repository the installation grants, which an ordinary member might not.
 */
export function mayAttach(
  inst: Installation,
  user: GitHubUser,
  role: Awaited<ReturnType<typeof orgRole>> | null,
): AttachVerdict {
  if (inst.accountType === "User")
    return inst.accountId === user.id
      ? { ok: true }
      : { ok: false, reason: `That app was installed on ${inst.account}, not on ${user.login}.` };
  if (role === "admin") return { ok: true };
  if (role === "missing_permission")
    return {
      ok: false,
      reason:
        "The app cannot confirm who owns that organisation yet. Accept its request for organisation Members access in GitHub, then try again.",
    };
  return {
    ok: false,
    reason: `Only an owner of ${inst.account} can connect its repositories, and ${user.login} is not one.`,
  };
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
