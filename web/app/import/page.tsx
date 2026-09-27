import Link from "next/link";
import { AppHeader } from "@/app/components/app-header";
import { createProject } from "@/app/projects/actions";
import { GitHubTokenMissing, listRepos, looksAbandoned, type Repo } from "@/lib/github";
import { githubAppConfig } from "@/lib/github-app-config";
import { requireUser } from "@/lib/session";
import { RepoPicker } from "./repo-picker";

/** Pick-list of the user's repos, public and those granted to the GitHub App, plus a manual project for anything not on GitHub. */
async function loadRepos(userId: string): Promise<{ repos: Repo[]; problem: string | null }> {
  try {
    return { repos: await listRepos(userId), problem: null };
  } catch (e) {
    return {
      repos: [],
      problem:
        e instanceof GitHubTokenMissing
          ? "Your GitHub session has expired. Sign out and back in to list repositories."
          : "GitHub is not answering right now.",
    };
  }
}

export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  const session = await requireUser();
  const { supabase, user } = session;
  const { error, private: connected } = await searchParams;
  const canConnect = githubAppConfig() !== null;
  const [{ repos, problem }, { data: existing }] = await Promise.all([
    loadRepos(user.id),
    supabase.from("projects").select("github_id").eq("user_id", user.id),
  ]);
  const imported = new Set((existing ?? []).map((p) => p.github_id));

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-sky to-ink">
      <AppHeader session={session} />
      <main className="w-full flex-1 px-6 pb-16 sm:px-10 lg:px-16">
        <Link href="/dashboard" className="text-sm text-muted hover:text-text">
          Back to all projects
        </Link>
        <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Add a project</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Pick the repositories to bring in. Each becomes a building on your dashboard; after that
          you choose which backend inside it to keep awake.
        </p>

        {(error || problem) && (
          <p
            role="alert"
            className="mt-8 max-w-2xl rounded-xl border border-dead/40 bg-dead/10 px-4 py-3 text-[15px] text-dead"
          >
            {error ?? problem}
          </p>
        )}

        {connected && !error && (
          <p
            role="status"
            className="mt-8 max-w-2xl rounded-xl border border-alive/40 bg-alive/10 px-4 py-3 text-[15px] text-alive"
          >
            Private repositories connected. The ones you granted now show in the list.
          </p>
        )}

        {canConnect && (
          <p className="mt-6 max-w-2xl text-[15px] text-muted">
            Missing a private repository?{" "}
            <a href="/connect/github/start" className="font-semibold text-text hover:text-alive">
              Choose which private repositories to include
            </a>
            . GitHub asks you which ones, and you can change that later.
          </p>
        )}

        {repos.length > 0 && (
          <RepoPicker
            repos={repos.map((r) => ({
              github_id: r.github_id,
              name: r.name,
              language: r.language,
              imported: imported.has(r.github_id),
              private: r.private,
              quiet: looksAbandoned(r.last_commit_at),
            }))}
          />
        )}

        <form action={createProject} className="mt-16 max-w-xl border-t border-line pt-10">
          <h2 className="text-xl font-semibold">Not on GitHub?</h2>
          <p className="mt-1 text-[15px] text-muted">
            Name the project and add its backends by hand.
          </p>
          <div className="mt-5 flex gap-3">
            <label className="sr-only" htmlFor="name">
              Project name
            </label>
            <input
              id="name"
              name="name"
              required
              maxLength={100}
              placeholder="my-side-project"
              className="flex-1 rounded-xl border border-line bg-ink px-4 py-2.5 text-[15px] placeholder:text-muted/50 focus:border-alive/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-alive/60 hover:text-alive"
            >
              Create project
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
