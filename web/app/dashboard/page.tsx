import Link from "next/link";
import { AppHeader } from "@/app/components/app-header";
import { latencyText, Stat } from "@/app/components/stat";
import { statusOf, targetTitle } from "@/lib/describe";
import { entitlements } from "@/lib/entitlements";
import { ago, every } from "@/lib/format";
import { bufferText, passRate, type State } from "@/lib/health";
import { loadHealth } from "@/lib/load-health";
import { requireUser } from "@/lib/session";
import { dayCells, uptimeOver } from "@/lib/uptime";
import { type ListProject, ProjectList } from "./project-list";

/** The control room: the night's totals, then every project with a 30-day row per backend. */
type Target = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
  label: string | null;
};
type Project = { id: string; name: string; last_commit_at: string | null; targets: Target[] };

const DAYS = 30;
/** Render's 15-minute sleep is reset by every check, so only day-long windows can run out. */
const DAY_S = 86_400;
const TROUBLE: State[] = ["failing", "paused", "pause_soon"];
const RANK: Record<State, number> = {
  paused: 0,
  failing: 1,
  pause_soon: 2,
  maintenance: 3,
  idle: 4,
  alive: 5,
};

function repoOf(name: string) {
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
        "id, name, last_commit_at, targets (id, url, platform, heartbeat_type, interval_seconds, label)",
      )
      .eq("archived", false)
      .order("created_at", { ascending: true }),
    entitlements(user.id),
  ]);

  const projects = (projectRows ?? []) as Project[];
  const targets = projects.flatMap((p) => p.targets ?? []);
  const { health, days, maintenance } = await loadHealth(
    supabase,
    targets.map((t) => t.id),
  );
  const now = Date.now();
  const status = new Map(
    targets.map((t) => [
      t.id,
      statusOf({ ...t, maintenance: maintenance.get(t.id) }, health.get(t.id), now),
    ]),
  );
  const stateOf = (id: string): State => status.get(id)?.state ?? "idle";
  const trouble = targets.filter((t) => TROUBLE.includes(stateOf(t.id)));
  const rate = passRate([...health.values()]);
  const projectOf = new Map(projects.flatMap((p) => p.targets.map((t) => [t.id, p] as const)));
  const nearest = targets
    .filter(
      (t) =>
        (health.get(t.id)?.pause_window_seconds ?? 0) >= DAY_S &&
        Date.parse(health.get(t.id)?.pause_at ?? "") > now,
    )
    .sort(
      (a, b) =>
        Date.parse(health.get(a.id)?.pause_at ?? "") - Date.parse(health.get(b.id)?.pause_at ?? ""),
    )[0];

  const latencies = [...health.values()]
    .map((h) => h.latency_7d)
    .filter((ms): ms is number => ms !== null);
  const meanLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  const oneOwner = new Set(projects.map((p) => repoOf(p.name).owner)).size <= 1;

  const worstOf = (p: Project): State | null =>
    p.targets.length
      ? [...p.targets.map((t) => stateOf(t.id))].sort((a, b) => RANK[a] - RANK[b])[0]
      : null;
  const ordered = [...projects].sort((a, b) => {
    const wa = worstOf(a);
    const wb = worstOf(b);
    return (wa === null ? 5 : RANK[wa]) - (wb === null ? 5 : RANK[wb]);
  });

  const listed: ListProject[] = ordered.map((p) => {
    const { owner, repo } = repoOf(p.name);
    const worst = worstOf(p);
    return {
      id: p.id,
      repo,
      owner: owner && !oneOwner ? owner : null,
      touched: p.last_commit_at ? ago(p.last_commit_at, now) : null,
      worst,
      needsYou: worst !== null && TROUBLE.includes(worst),
      backends: [...p.targets]
        .sort((a, b) => RANK[stateOf(a.id)] - RANK[stateOf(b.id)])
        .map((t) => {
          const h = health.get(t.id);
          const rows = days.get(t.id) ?? [];
          const uptime = uptimeOver(rows, DAYS, now);
          return {
            id: t.id,
            title: targetTitle(t).title,
            state: stateOf(t.id),
            headline: status.get(t.id)?.headline ?? "",
            cells: dayCells(rows, DAYS, now),
            uptime: uptime === null ? "—" : `${uptime}%`,
            latency: latencyText(h?.latency_7d),
            buffer:
              t.heartbeat_type === "inbound"
                ? every(t.interval_seconds).replace("every", "Every")
                : (bufferText(h, now)?.replace(" before pause", "") ?? "Never pauses"),
          };
        }),
    };
  });

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader session={session} />
      <main className="w-full flex-1 px-6 pb-20 sm:px-10 lg:px-16">
        <section className="flex flex-wrap items-end justify-between gap-6 pt-6">
          <h1 className="text-4xl font-semibold sm:text-5xl">
            {headline(targets.length, trouble.length)}
          </h1>
          <Link
            href="/import"
            className="rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn"
          >
            Add a project
          </Link>
        </section>

        {targets.length > 0 && (
          <dl className="mt-8 grid grid-cols-2 gap-x-10 gap-y-6 border-y border-line py-6 lg:grid-cols-4">
            <Stat label="Checks passed this week" value={rate === null ? "—" : `${rate}%`} />
            <Stat
              label="Closest to pausing"
              value={
                nearest
                  ? (bufferText(health.get(nearest.id), now)?.replace(" before pause", "") ?? "—")
                  : "Nothing"
              }
              note={
                nearest
                  ? `${repoOf(projectOf.get(nearest.id)?.name ?? "").repo}'s ${targetTitle(nearest).title}`
                  : undefined
              }
            />
            <Stat
              label="Average response"
              value={latencyText(meanLatency)}
              note={`across ${targets.length} ${targets.length === 1 ? "backend" : "backends"}`}
            />
            <Stat
              label={`${limits.planName} plan`}
              value={`${targets.length} of ${limits.limits.max_targets}`}
              note="backends used"
            />
          </dl>
        )}

        {trouble.length > 0 && (
          <section className="mt-8 rounded-2xl border border-dead/40 bg-dead/10 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-dead">Needs you</h2>
            <ul className="mt-2 space-y-1.5">
              {trouble.map((t) => {
                const p = projectOf.get(t.id);
                return (
                  <li key={t.id} className="text-[15px]">
                    <Link href={`/projects/${p?.id}`} className="font-medium hover:text-alive">
                      {p ? `${repoOf(p.name).repo}'s ` : ""}
                      {targetTitle(t).title}
                    </Link>
                    <span className="text-muted">: {status.get(t.id)?.sentence}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {projects.length === 0 ? (
          <p className="mt-16 max-w-xl text-lg leading-relaxed text-muted">
            Import a repository to add your first project, then tell us which backend to keep awake.
            That is usually the database, not the website in front of it.
          </p>
        ) : (
          <ProjectList projects={listed} days={DAYS} />
        )}
      </main>
    </div>
  );
}
