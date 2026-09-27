import Link from "next/link";
import { redirect } from "next/navigation";
import { type RowTarget, TargetRow } from "@/app/components/target-row";
import { entitlements } from "@/lib/entitlements";
import { ago } from "@/lib/format";
import { stateOf } from "@/lib/health";
import { loadHealth } from "@/lib/load-health";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Every project and target the user owns, worst news first in the summary line. */
type Project = {
  id: string;
  name: string;
  language: string | null;
  last_commit_at: string | null;
  targets: RowTarget[];
};

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** RLS limits the update to the caller's own profile row. */
async function setAlerts(formData: FormData) {
  "use server";
  const { supabase, user } = await requireUser();
  await supabase
    .from("profiles")
    .update({ alerts_enabled: formData.get("enabled") === "true" })
    .eq("id", user.id);
  redirect("/dashboard");
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, { data: projectRows }, limits] = await Promise.all([
    supabase
      .from("profiles")
      .select("github_username, alerts_enabled")
      .eq("id", user.id)
      .maybeSingle(),
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
  const { health, days } = await loadHealth(
    supabase,
    targets.map((t) => t.id),
  );
  const now = Date.now();
  const states = targets.map((t) => stateOf(health.get(t.id), now));
  const trouble = states.filter((s) => s === "failing" || s === "paused").length;
  const soon = states.filter((s) => s === "pause_soon").length;
  const alertsOn = profile?.alerts_enabled ?? true;

  return (
    <>
      <header className="border-b border-line">
        <div className="flex items-center gap-4 px-6 py-4 sm:px-10 lg:px-16">
          <span className="pulse size-2 rounded-full bg-alive" aria-hidden />
          <span className="font-mono text-sm tracking-tight">projectsleeve</span>
          <span className="ml-auto hidden font-mono text-xs text-muted sm:inline">
            {limits.planName} · {projects.length}/{limits.limits.max_projects} projects ·{" "}
            {targets.length}/{limits.limits.max_targets} targets
          </span>
          <Link href="/import" className="font-mono text-xs text-muted hover:text-text">
            + project
          </Link>
          <form action={setAlerts}>
            <input type="hidden" name="enabled" value={String(!alertsOn)} />
            <button type="submit" className="font-mono text-xs text-muted hover:text-text">
              alerts {alertsOn ? "on" : "off"}
            </button>
          </form>
          {profile?.github_username && (
            <span className="font-mono text-xs text-muted">{profile.github_username}</span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="font-mono text-xs text-muted transition-colors hover:text-text"
            >
              sign out
            </button>
          </form>
        </div>
      </header>

      <main className="w-full flex-1 px-6 py-12 sm:px-10 lg:px-16">
        {projects.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-10">
            <h1 className="text-lg font-medium">Nothing is being kept alive yet.</h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
              Import a repository to create a project, then point a target at the thing that
              actually pauses — usually your database, not the site in front of it.
            </p>
            <Link
              href="/import"
              className="mt-6 inline-block border border-line bg-raised px-4 py-2 text-sm font-medium hover:border-muted/40"
            >
              Import a repository
            </Link>
          </div>
        ) : (
          <>
            <p
              role="status"
              className={`mb-10 font-mono text-sm ${trouble ? "text-dead" : soon ? "text-warn" : "text-muted"}`}
            >
              {trouble
                ? `${trouble} target${trouble > 1 ? "s" : ""} need${trouble > 1 ? "" : "s"} attention.`
                : soon
                  ? `${soon} target${soon > 1 ? "s" : ""} could pause within 48 hours.`
                  : `All ${targets.length} targets are alive.`}
              {!alertsOn && " Alert email is off."}
            </p>
            <div className="space-y-10">
              {projects.map((project) => (
                <section key={project.id}>
                  <div className="flex items-baseline gap-3 border-b border-line pb-2">
                    <h2 className="text-sm font-medium">
                      <Link href={`/projects/${project.id}`} className="hover:text-accent">
                        {project.name}
                      </Link>
                    </h2>
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
                      {project.targets.map((t) => (
                        <TargetRow
                          key={t.id}
                          target={t}
                          health={health.get(t.id)}
                          days={days.get(t.id) ?? []}
                          now={now}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
