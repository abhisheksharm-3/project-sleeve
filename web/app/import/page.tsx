import Link from "next/link";
import { createProject, importRepos } from "@/app/projects/actions";
import { GitHubTokenMissing, listRepos, looksAbandoned, type Repo } from "@/lib/github";
import { requireUser } from "@/lib/session";

/** Pick-list of the user's public repos, plus a manual project for anything not on GitHub. */
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
  const { supabase, user } = await requireUser();
  const { error } = await searchParams;
  const [{ repos, problem }, { data: existing }] = await Promise.all([
    loadRepos(user.id),
    supabase.from("projects").select("github_id"),
  ]);
  const imported = new Set((existing ?? []).map((p) => p.github_id));

  return (
    <main className="w-full flex-1 px-6 py-12 sm:px-10 lg:px-16">
      <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-text">
        ← dashboard
      </Link>
      <h1 className="mt-6 text-2xl font-medium">Import repositories</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        A repository becomes a project. It is not kept alive by itself: next you point a target at
        the backend that actually pauses.
      </p>

      {(error || problem) && (
        <p
          role="alert"
          className="mt-6 max-w-xl border border-dead/40 bg-dead/10 px-3 py-2 font-mono text-xs text-dead"
        >
          {error ?? problem}
        </p>
      )}

      {repos.length > 0 && (
        <form action={importRepos} className="mt-8">
          <ul className="border border-line bg-surface">
            {repos.map((r) => {
              const done = imported.has(r.github_id);
              return (
                <li key={r.github_id} className="border-b border-line/60 last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-4 px-4 py-3 has-[:disabled]:cursor-default has-[:disabled]:opacity-50">
                    <input
                      type="checkbox"
                      name="repo"
                      value={r.github_id}
                      disabled={done}
                      className="accent-alive"
                    />
                    <span className="truncate font-mono text-sm">{r.name}</span>
                    {looksAbandoned(r.last_commit_at) && !done && (
                      <span className="shrink-0 border border-warn/40 px-1.5 font-mono text-[11px] text-warn">
                        quiet 60d+ · likely to pause
                      </span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                      {done ? "imported" : (r.language ?? "")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="submit"
            className="mt-5 border border-line bg-surface px-5 py-2.5 text-sm font-medium hover:bg-raised"
          >
            Import selected
          </button>
        </form>
      )}

      <form action={createProject} className="mt-12 max-w-xl border-t border-line pt-8">
        <h2 className="font-mono text-xs tracking-wide text-muted uppercase">Or add one by hand</h2>
        <div className="mt-4 flex gap-3">
          <label className="sr-only" htmlFor="name">
            Project name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={100}
            placeholder="my-side-project"
            className="flex-1 border border-line bg-ink px-3 py-2 font-mono text-sm placeholder:text-muted/60"
          />
          <button
            type="submit"
            className="border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-raised"
          >
            Create
          </button>
        </div>
      </form>
    </main>
  );
}
