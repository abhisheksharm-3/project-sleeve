"use client";
/**
 * Search-first repository picker. Each repository is a small building; choosing one switches
 * its light on, and the chosen ones collect in a panel beside the grid.
 */
import { useMemo, useState } from "react";
import { importRepos } from "@/app/projects/actions";

export type PickerRepo = {
  github_id: number;
  name: string;
  language: string | null;
  imported: boolean;
  private: boolean;
  quiet: boolean;
};

const RECENT = 9;

function repoName(full: string) {
  return full.split("/")[1] ?? full;
}

export function RepoPicker({ repos }: { repos: PickerRepo[] }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos.filter((r) => !r.imported).slice(0, RECENT);
    return repos.filter((r) => r.name.toLowerCase().includes(q));
  }, [query, repos]);

  const byId = useMemo(() => new Map(repos.map((r) => [r.github_id, r])), [repos]);

  function toggle(id: number) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form action={importRepos} className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {chosen.map((id) => (
        <input key={id} type="hidden" name="repo" value={id} />
      ))}

      <div className="min-w-0">
        <label htmlFor="repo-search" className="sr-only">
          Search your repositories
        </label>
        <input
          id="repo-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search your ${repos.length} repositories`}
          autoComplete="off"
          className="w-full rounded-full border border-line bg-surface px-6 py-3.5 text-base placeholder:text-muted/60 focus:border-alive/60 focus:outline-none"
        />
        <p className="mt-3 px-2 text-sm text-muted" aria-live="polite">
          {query.trim()
            ? `${shown.length} ${shown.length === 1 ? "repository matches" : "repositories match"}.`
            : "Your most recently updated repositories. Search to find the rest."}
        </p>

        {shown.length === 0 ? (
          <p className="mt-8 px-2 text-[15px] text-muted">
            Nothing matches that. Check the spelling, or add it by hand below.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => {
              const on = chosen.includes(r.github_id);
              const light = r.imported
                ? "window-lit"
                : on
                  ? "window-lit"
                  : r.quiet
                    ? "window-dim flicker"
                    : "window-dark";
              return (
                <li key={r.github_id}>
                  <button
                    type="button"
                    onClick={() => toggle(r.github_id)}
                    disabled={r.imported}
                    aria-pressed={on}
                    className={`flex h-full w-full items-start gap-4 rounded-t-xl border border-b-2 p-4 text-left transition-colors disabled:cursor-default disabled:opacity-55 ${
                      on
                        ? "border-alive/70 border-b-alive bg-raised"
                        : "border-line bg-surface hover:border-muted/50"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 h-7 w-5 shrink-0 rounded-[3px] ${light}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">
                        {repoName(r.name)}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {r.imported
                          ? "Already on your dashboard"
                          : r.quiet
                            ? "Quiet for 60+ days"
                            : (r.language ?? "Repository")}
                        {r.private && !r.imported && ", private"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Adding</h2>
          {chosen.length === 0 ? (
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Choose a repository to switch its light on. Quiet ones flicker: they are the likeliest
              to have a backend close to pausing.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {chosen.map((id) => (
                <li key={id} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden className="window-lit h-3.5 w-2.5 shrink-0 rounded-[2px]" />
                    <span className="truncate">{repoName(byId.get(id)?.name ?? "")}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="shrink-0 text-sm text-muted hover:text-dead"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="submit"
            disabled={chosen.length === 0}
            className="mt-6 w-full rounded-full bg-alive px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-warn disabled:cursor-not-allowed disabled:opacity-40"
          >
            {chosen.length === 0
              ? "Add projects"
              : `Add ${chosen.length} ${chosen.length === 1 ? "project" : "projects"}`}
          </button>
        </div>
      </aside>
    </form>
  );
}
