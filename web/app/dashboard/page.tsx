import { redirect } from "next/navigation";
import { entitlements } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";

type Target = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
  enabled: boolean;
};

type Project = {
  id: string;
  name: string;
  repo_url: string | null;
  language: string | null;
  last_commit_at: string | null;
  targets: Target[];
};

type Ping = {
  target_id: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  ran_at: string;
};

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function every(seconds: number): string {
  if (seconds % 3600 === 0) return `every ${seconds / 3600}h`;
  if (seconds % 60 === 0) return `every ${seconds / 60}m`;
  return `every ${seconds}s`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: projectRows }, limits] = await Promise.all([
    supabase.from("profiles").select("github_username, avatar_url").eq("id", user.id).maybeSingle(),
    supabase
      .from("projects")
      .select(
        "id, name, repo_url, language, last_commit_at, targets (id, url, platform, heartbeat_type, interval_seconds, enabled)",
      )
      .eq("archived", false)
      .order("created_at", { ascending: true }),
    entitlements(user.id),
  ]);

  const projects = (projectRows ?? []) as Project[];
  const targets = projects.flatMap((p) => p.targets ?? []);

  // One query for the whole page rather than one per target; reduced to the newest row each.
  const latest = new Map<string, Ping>();
  if (targets.length) {
    const { data: pings } = await supabase
      .from("ping_log")
      .select("target_id, ok, status_code, latency_ms, ran_at")
      .in(
        "target_id",
        targets.map((t) => t.id),
      )
      .order("ran_at", { ascending: false })
      .limit(targets.length * 10);
    for (const p of (pings ?? []) as Ping[]) {
      if (!latest.has(p.target_id)) latest.set(p.target_id, p);
    }
  }

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3.5">
          <span className="pulse size-2 rounded-full bg-alive" aria-hidden />
          <span className="font-mono text-sm tracking-tight">projectsleeve</span>
          <span className="ml-auto font-mono text-xs text-muted">
            {limits.planName} · {projects.length}/{limits.limits.max_projects} projects ·{" "}
            {targets.length}/{limits.limits.max_targets} targets
          </span>
          {profile?.github_username && (
            <span className="font-mono text-xs text-muted">{profile.github_username}</span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="font-mono text-xs text-muted hover:text-text transition-colors"
            >
              sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {projects.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-10">
            <h1 className="text-lg font-medium">Nothing is being kept alive yet.</h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
              Import a repository to create a project, then point a target at the thing that
              actually pauses — usually your database, not the site in front of it.
            </p>
            <p className="mt-6 font-mono text-xs text-muted">repo import lands in the next slice</p>
          </div>
        ) : (
          <div className="space-y-8">
            {projects.map((project) => (
              <section key={project.id}>
                <div className="flex items-baseline gap-3 border-b border-line pb-2">
                  <h2 className="text-sm font-medium">{project.name}</h2>
                  {project.language && (
                    <span className="font-mono text-xs text-muted">{project.language}</span>
                  )}
                  {project.last_commit_at && (
                    <span className="ml-auto font-mono text-xs text-muted">
                      last commit {ago(project.last_commit_at)}
                    </span>
                  )}
                </div>

                {(project.targets ?? []).length === 0 ? (
                  <p className="px-1 py-4 font-mono text-xs text-muted">
                    no targets — nothing here is being kept alive
                  </p>
                ) : (
                  <ul>
                    {project.targets.map((target) => {
                      const ping = latest.get(target.id);
                      const state = !ping ? "idle" : ping.ok ? "alive" : "dead";
                      const dot =
                        state === "alive"
                          ? "bg-alive pulse"
                          : state === "dead"
                            ? "bg-dead"
                            : "bg-muted";
                      return (
                        <li
                          key={target.id}
                          className="flex items-center gap-3 border-b border-line/60 py-2.5"
                        >
                          <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                          <span className="truncate font-mono text-xs">{target.url}</span>
                          <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                            {target.platform} · {target.heartbeat_type} ·{" "}
                            {every(target.interval_seconds)}
                          </span>
                          <span
                            className={`w-28 shrink-0 text-right font-mono text-xs ${
                              state === "dead" ? "text-dead" : "text-muted"
                            }`}
                          >
                            {ping
                              ? `${ping.status_code ?? "err"} · ${ago(ping.ran_at)}`
                              : "never pinged"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
