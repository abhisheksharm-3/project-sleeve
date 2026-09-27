"use client";
/** Every project with a 30-day row per backend, searchable by project or backend name. */
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { DayWindows } from "@/app/components/day-windows";
import { Window, WindowState } from "@/app/components/window";
import type { State } from "@/lib/health";
import type { DayCell } from "@/lib/uptime";

export type ListBackend = {
  id: string;
  title: string;
  state: State;
  headline: string;
  cells: DayCell[];
  uptime: string;
  latency: string;
  buffer: string;
};

export type ListProject = {
  id: string;
  repo: string;
  owner: string | null;
  touched: string | null;
  shared: boolean;
  worst: State | null;
  needsYou: boolean;
  backends: ListBackend[];
};

const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 md:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)_4.5rem_4.5rem_6rem_8.5rem] md:items-center";

export function ProjectList({ projects, days }: { projects: ListProject[]; days: number }) {
  const [query, setQuery] = useState("");
  const [onlyTrouble, setOnlyTrouble] = useState(false);
  const q = useDeferredValue(query.trim().toLowerCase());
  const troubled = projects.filter((p) => p.needsYou).length;
  const shown = projects.filter(
    (p) =>
      (!onlyTrouble || p.needsYou) &&
      (!q ||
        p.repo.toLowerCase().includes(q) ||
        p.backends.some((b) => b.title.toLowerCase().includes(q))),
  );
  const tab = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm transition-colors ${
      active ? "bg-raised text-text" : "text-muted hover:text-text"
    }`;

  return (
    <section aria-label="Projects" className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="project-search" className="sr-only">
          Search projects
        </label>
        <input
          id="project-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${projects.length} projects`}
          autoComplete="off"
          className="w-full max-w-sm rounded-full border border-line bg-surface px-5 py-2.5 text-[15px] placeholder:text-muted/60 focus:border-alive/60 focus:outline-none"
        />
        <fieldset className="flex gap-1">
          <legend className="sr-only">Filter projects</legend>
          <button
            type="button"
            aria-pressed={!onlyTrouble}
            onClick={() => setOnlyTrouble(false)}
            className={tab(!onlyTrouble)}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={onlyTrouble}
            onClick={() => setOnlyTrouble(true)}
            className={tab(onlyTrouble)}
          >
            Needs you{troubled ? ` (${troubled})` : ""}
          </button>
        </fieldset>
      </div>

      <div className={`${ROW} mt-8 pb-3 text-sm text-muted max-md:hidden`} aria-hidden>
        <span>Backend</span>
        <span>Last {days} days</span>
        <span className="text-right">Passed</span>
        <span className="text-right">Responds</span>
        <span className="text-right">Pause buffer</span>
        <span>Now</span>
      </div>

      {shown.length === 0 ? (
        <p className="border-t border-line py-8 text-[15px] text-muted" aria-live="polite">
          {onlyTrouble && !q
            ? "Nothing needs you. Every backend is awake."
            : "No project or backend matches that."}
        </p>
      ) : (
        <ul className="border-line max-md:mt-6 md:border-t">
          {shown.map((p) => (
            <li key={p.id} className="border-b border-line py-5">
              <div className="flex items-center gap-3">
                <Window state={p.worst ?? "idle"} size="sm" />
                <Link href={`/projects/${p.id}`} className="text-lg font-semibold hover:text-alive">
                  {p.repo}
                </Link>
                {p.owner && <span className="text-sm text-muted max-sm:hidden">{p.owner}</span>}
                {p.shared && (
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                    Shared with you
                  </span>
                )}
                {p.touched && (
                  <span className="ml-auto text-sm text-muted">Code touched {p.touched}</span>
                )}
              </div>
              {p.backends.length === 0 ? (
                <p className="mt-3 text-[15px] text-muted">
                  Nothing kept awake yet.{" "}
                  <Link
                    href={`/projects/${p.id}#add`}
                    className="font-medium text-alive underline decoration-alive/40 underline-offset-4"
                  >
                    Add its backend
                  </Link>
                </p>
              ) : (
                <ul className="mt-3 space-y-3 md:space-y-2">
                  {p.backends.map((b) => (
                    <li key={b.id} className={ROW}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="truncate text-[15px] hover:text-alive"
                      >
                        {b.title}
                      </Link>
                      <span className="md:order-last">
                        <WindowState state={b.state} label={b.headline} />
                      </span>
                      <span className="col-span-2 md:col-span-1">
                        <DayWindows cells={b.cells} className="h-5" />
                      </span>
                      <span className="text-sm tabular-nums md:text-right">
                        {b.uptime}
                        <span className="text-muted md:hidden"> passed</span>
                      </span>
                      <span className="text-right text-sm text-muted tabular-nums max-md:hidden">
                        {b.latency}
                      </span>
                      <span className="text-right text-sm text-muted tabular-nums max-md:hidden">
                        {b.buffer}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
