/** Lists a user's public GitHub repositories for import, using their stored OAuth token. */
import "server-only";
import { createAdminClient } from "./supabase/admin";

export type Repo = {
  github_id: number;
  name: string;
  repo_url: string;
  language: string | null;
  last_commit_at: string | null;
  archived: boolean;
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

/**
 * Newest-pushed first, forks excluded. Throws GitHubTokenMissing when there is no token or
 * GitHub rejects it, so the caller can send the user back through sign-in.
 *
 * ponytail: stops at 500 repos (5 pages of 100); page further if someone owns more.
 */
export async function listRepos(userId: string): Promise<Repo[]> {
  const { data } = await createAdminClient()
    .from("github_credentials")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.access_token) throw new GitHubTokenMissing();

  const repos: Repo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner&visibility=public`,
      {
        headers: {
          authorization: `Bearer ${data.access_token}`,
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
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
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
