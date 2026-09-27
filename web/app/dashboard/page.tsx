import Link from "next/link";
import { AppHeader } from "@/app/components/app-header";
import { Window } from "@/app/components/window";
import { PLATFORM_NAMES, statusOf, targetTitle } from "@/lib/describe";
import { entitlements } from "@/lib/entitlements";
import { ago } from "@/lib/format";
import { bufferText, type Health, passRate, type State } from "@/lib/health";
import { loadHealth } from "@/lib/load-health";
import { requireUser } from "@/lib/session";

/** The skyline: every project a building, every backend a window, the night's totals above. */
type Target = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
};
type Project = {
  id: string;
  name: string;
  language: string | null;
  last_commit_at: string | null;
  targets: Target[];
};

const TROUBLE: State[] = ["failing", "paused", "pause_soon"];
const RANK: Record<State, number> = { paused: 0, failing: 1, pause_soon: 2, idle: 3, alive: 4 };

function splitName(name: string) {
  const [owner, repo] = name.includes("/") ? name.split("/") : ["", name];
  return { owner, repo };
}

function headline(total: number, trouble: number) {
  if (total === 0) return "No lights on yet.";
  if (trouble === 0) return total === 1 ? "The light is on." : `All ${total} lights are on.`;
  return `${trouble} of ${total} lights ${trouble === 1 ? "is" : "are"} flickering.`;
}

export default async function DashboardPage() {
  const session = await requireUser();
  const { supabase, user } = session;
  const [{ data: projectRows }, limits] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, language, last_commit_at, targets (id, url, platform, heartbeat_type, interval_seconds)",
      )
      .eq("archived", false)
      .order("created_at", { ascending: true }),
    entitlements(user.id),
  ]);

  const projects = (projectRows ?? []) as Project[];
  const targets = projects.flatMap((p) => p.targets ?? []);
  const { health } = await loadHealth(
    supabase,
    targets.map((t) => t.id),
  );
  const now = Date.now();
  const status = new Map(targets.map((t) => [t.id, statusOf(t, health.get(t.id), now)]));
  const trouble = targets.filter((t) => TROUBLE.includes(status.get(t.id)?.state ?? "idle"));
  const rate = passRate([...health.values()]);
  const nearest = targets
    .filter((t) => Date.parse(health.get(t.id)?.pause_at ?? "") > now)
    .sort(
      (a, b) =>
        Date.parse(health.get(a.id)?.pause_at ?? "") - Date.parse(health.get(b.id)?.pause_at ?? ""),
    )[0];
  const nearestProject =
    nearest && projects.find((p) => p.targets.some((t) => t.id === nearest.id));

  const byPlatform = new Map<string, Health[]>();
  for (const t of targets) {
    const h = health.get(t.id);
    if (h) byPlatform.set(t.platform, [...(byPlatform.get(t.platform) ?? []), h]);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-sky to-ink">
      <AppHeader session={session} />
      <main className="w-full flex-1 px-6 pb-16 sm:px-10 lg:px-16">
        <section className="flex flex-wrap items-end justify-between gap-6 pt-10">
          <h1 className="text-4xl font-semibold sm:text-5xl">
            {headline(targets.length, trouble.length)}
          </h1>
          <div className="flex items-center gap-5">
            <span className="text-sm text-muted">
              {targets.length} of {limits.limits.max_targets} backends on {limits.planName}
            </span>
            <Link
              href="/import"
              className="rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn"
            >
              Add a project
            </Link>
          </div>
        </section>

        {targets.length > 0 && (
          <dl className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            <div className="bg-surface p-5">
              <dt className="text-sm text-muted">Checks passed this week</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">
                {rate === null ? "—" : `${rate}%`}
              </dd>
            </div>
            <div className="bg-surface p-5">
              <dt className="text-sm text-muted">First to pause if checks stopped</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">
                {nearest
                  ? (bufferText(health.get(nearest.id), now)?.replace(" before pause", "") ?? "—")
                  : "—"}
              </dd>
              {nearest && nearestProject && (
                <p className="mt-0.5 truncate text-sm text-muted">
                  {splitName(nearestProject.name).repo}&apos;s {targetTitle(nearest).title}
                </p>
              )}
            </div>
            <div className="bg-surface p-5">
              <dt className="text-sm text-muted">Kept awake</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums">
                {targets.length - trouble.length}
                <span className="text-lg font-normal text-muted"> of {targets.length}</span>
              </dd>
              <p className="mt-0.5 text-sm text-muted">across {projects.length} projects</p>
            </div>
          </dl>
        )}

        {byPlatform.size > 1 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {[...byPlatform].map(([p, rows]) => (
              <li
                key={p}
                className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm"
              >
                <span className="font-medium">{PLATFORM_NAMES[p] ?? p}</span>
                <span className="text-muted">
                  {rows.length} {rows.length === 1 ? "backend" : "backends"}, {passRate(rows) ?? 0}%
                  passed
                </span>
              </li>
            ))}
          </ul>
        )}

        {trouble.length > 0 && (
          <section className="mt-10 rounded-2xl border border-dead/40 bg-dead/10 p-5">
            <h2 className="text-base font-semibold text-dead">Needs you</h2>
            <ul className="mt-3 space-y-2">
              {trouble.map((t) => {
                const s = status.get(t.id);
                const p = projects.find((pr) => pr.targets.some((x) => x.id === t.id));
                return (
                  <li key={t.id} className="text-[15px]">
                    <Link href={`/projects/${p?.id}`} className="font-medium hover:text-alive">
                      {p ? `${splitName(p.name).repo}'s ` : ""}
                      {targetTitle(t).title}
                    </Link>
                    <span className="text-muted">: {s?.sentence}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {projects.length === 0 ? (
          <section className="mt-16 max-w-xl">
            <p className="text-lg leading-relaxed text-muted">
              Import a repository to put up your first building, then tell us which backend to keep
              lit. That is usually the database, not the website in front of it.
            </p>
          </section>
        ) : (
          <section
            aria-label="Projects"
            className="mt-14 grid grid-cols-1 gap-x-5 gap-y-12 sm:grid-cols-2 xl:grid-cols-3"
          >
            {projects.map((project) => {
              const { owner, repo } = splitName(project.name);
              const list = [...(project.targets ?? [])].sort(
                (a, b) =>
                  RANK[status.get(a.id)?.state ?? "idle"] - RANK[status.get(b.id)?.state ?? "idle"],
              );
              const worst = list[0] ? status.get(list[0].id) : undefined;
              const rows = list.map((t) => health.get(t.id)).filter((h): h is Health => !!h);
              const projectRate = passRate(rows);
              const nextPause = list
                .map((t) => health.get(t.id))
                .filter((h): h is Health => !!h?.pause_at && Date.parse(h.pause_at) > now)
                .sort((x, y) => Date.parse(x.pause_at ?? "") - Date.parse(y.pause_at ?? ""))[0];
              return (
                <div key={project.id} className="flex flex-col justify-end">
                  <Link
                    href={`/projects/${project.id}`}
                    className="group relative block rounded-t-xl border border-b-0 border-line bg-surface px-5 pt-5 pb-5 transition-colors hover:border-alive/50"
                  >
                    <span
                      aria-hidden
                      className="absolute -top-2.5 right-8 h-2.5 w-10 rounded-t-sm border border-b-0 border-line bg-surface"
                    />
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="truncate text-lg font-semibold group-hover:text-alive">
                        {repo}
                      </h2>
                      <span className="shrink-0 text-xs text-muted">
                        {project.last_commit_at
                          ? `touched ${ago(project.last_commit_at, now)}`
                          : project.language}
                      </span>
                    </div>
                    {owner && <p className="text-xs text-muted">{owner}</p>}

                    {list.length === 0 ? (
                      <>
                        <div aria-hidden className="mt-5 flex gap-2">
                          <span className="window-dark h-10 w-7 rounded-[4px]" />
                          <span className="window-dark h-10 w-7 rounded-[4px]" />
                        </div>
                        <p className="mt-4 text-sm text-warn">
                          No lights yet. Add the backend to keep awake.
                        </p>
                      </>
                    ) : (
                      <>
                        <div aria-hidden className="mt-5 flex flex-wrap gap-2">
                          {list.map((t) => (
                            <Window
                              key={t.id}
                              state={status.get(t.id)?.state ?? "idle"}
                              size="lg"
                            />
                          ))}
                        </div>
                        <ul className="mt-4 space-y-1.5">
                          {list.map((t) => (
                            <li
                              key={t.id}
                              className="flex items-baseline justify-between gap-3 text-sm"
                            >
                              <span className="truncate">{targetTitle(t).title}</span>
                              <span className="shrink-0 text-muted">
                                {status.get(t.id)?.headline}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {worst && TROUBLE.includes(worst.state) ? (
                          <p className="mt-4 text-sm text-dead">{worst.sentence}</p>
                        ) : (
                          <p className="mt-4 text-sm text-muted">
                            {projectRate !== null && (
                              <span className="text-text">{projectRate}% passed</span>
                            )}
                            {projectRate !== null && nextPause && ". "}
                            {nextPause && (
                              <>
                                would pause in{" "}
                                {bufferText(nextPause, now)?.replace(" before pause", "")}
                              </>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </Link>
                  <div aria-hidden className="-mx-2.5 h-0.5 bg-line" />
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
