/**
 * Lists the GitHub repositories a user can import: public ones through their OAuth token, and
 * private ones through the GitHub App installations they attached.
 */
import "server-only";
import { type AppRepo, appJwt, installationRepos, installationToken } from "./github-app";
import { githubAppConfig } from "./github-app-config";
import { createAdminClient } from "./supabase/admin";

export type Repo = {
  github_id: number;
  name: string;
  repo_url: string;
  language: string | null;
  last_commit_at: string | null;
  archived: boolean;
  private: boolean;
};

export class GitHubTokenMissing extends Error {}

type ApiRepo = {
  id: number;
  full_name: string;
  html_url: string;
  language: string | null;
  pushed_at: string | null;
  archived: boolean;
  fork: boolean;
};

const MAX_PAGES = 5;

/** The user's stored GitHub token, or GitHubTokenMissing when sign-in has to run again. */
export async function githubToken(userId: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("github_credentials")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.access_token) throw new GitHubTokenMissing();
  return data.access_token;
}

/**
 * Public repositories, newest-pushed first, forks excluded. Throws GitHubTokenMissing when there is no token or
 * GitHub rejects it, so the caller can send the user back through sign-in.
 *
 * ponytail: stops at 500 repos (5 pages of 100); page further if someone owns more.
 */
async function publicRepos(token: string): Promise<Repo[]> {
  const repos: Repo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner&visibility=public`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
        cache: "no-store",
      },
    );
    if (res.status === 401) throw new GitHubTokenMissing();
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);

    const batch = (await res.json()) as ApiRepo[];
    for (const r of batch) {
      if (r.fork) continue;
      repos.push({
        github_id: r.id,
        name: r.full_name,
        repo_url: r.html_url,
        language: r.language,
        last_commit_at: r.pushed_at,
        archived: r.archived,
        private: false,
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

function fromApp(r: AppRepo): Repo {
  return {
    github_id: r.id,
    name: r.full_name,
    repo_url: r.html_url,
    language: r.language,
    last_commit_at: r.pushed_at,
    archived: r.archived,
    private: r.private,
  };
}

/**
 * Repositories granted through the user's app installations, each with the installation
 * token that can read it. Empty when the app is not configured; an installation GitHub no
 * longer honours, because it was uninstalled, is skipped.
 */
export async function installationAccess(
  userId: string,
): Promise<{ repos: Repo[]; tokens: Map<string, string> }> {
  const access = { repos: [] as Repo[], tokens: new Map<string, string>() };
  const config = githubAppConfig();
  if (!config) return access;
  const { data } = await createAdminClient()
    .from("github_installations")
    .select("installation_id")
    .eq("user_id", userId);
  const jwt = appJwt(config.appId, config.privateKey);
  await Promise.all(
    (data ?? []).map(async ({ installation_id }) => {
      const token = await installationToken(jwt, installation_id).catch(() => null);
      if (!token) return;
      for (const r of await installationRepos(token).catch(() => [])) {
        if (r.fork) continue;
        access.tokens.set(r.full_name, token);
        access.repos.push(fromApp(r));
      }
    }),
  );
  return access;
}

/** Public and installation repositories together, once each, newest-pushed first. */
export async function listRepos(userId: string): Promise<Repo[]> {
  const [open, { repos: granted }] = await Promise.all([
    githubToken(userId).then(publicRepos),
    installationAccess(userId),
  ]);
  const byId = new Map([...granted, ...open].map((r) => [r.github_id, r]));
  return [...byId.values()].sort((a, b) =>
    (b.last_commit_at ?? "").localeCompare(a.last_commit_at ?? ""),
  );
}

const ABANDONED_AFTER_DAYS = 60;

/**
 * A repo with no push in 60 days: the same threshold at which GitHub disables its
 * scheduled workflows, and the project most likely to have a backend about to pause.
 */
export function looksAbandoned(lastCommitAt: string | null, now = Date.now()): boolean {
  if (!lastCommitAt) return false;
  return now - new Date(lastCommitAt).getTime() > ABANDONED_AFTER_DAYS * 86_400_000;
}
