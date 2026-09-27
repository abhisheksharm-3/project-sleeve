import Link from "next/link";
import { notFound } from "next/navigation";
import { TargetRow } from "@/app/components/target-row";
import { removeTarget, testTarget } from "@/app/projects/actions";
import { entitlements } from "@/lib/entitlements";
import { loadHealth } from "@/lib/load-health";
import { requireUser } from "@/lib/session";
import { TargetForms } from "./target-forms";

/** One project: its targets, their last outcome, and the forms to add more. */
type Target = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
  secret: string | null;
};

/** The route a user drops into their own app so a db_query ping runs a real query. */
function Snippet({ secret }: { secret: string }) {
  const code = `// app/api/keepalive/route.ts
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== \`Bearer \${process.env.SLEEVE_SECRET}\`) {
    return new Response("forbidden", { status: 403 });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await db.from("YOUR_TABLE").select("*", { head: true, count: "exact" }).limit(1);
  return new Response(error ? "db error" : "ok", { status: error ? 500 : 200 });
}`;
  return (
    <div className="mt-4 border border-accent/40 bg-accent/5 p-4">
      <p className="text-sm">Add this route to your app, then set its secret:</p>
      <pre className="mt-3 overflow-x-auto border border-line bg-ink p-3 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <p className="mt-3 font-mono text-xs text-muted">
        SLEEVE_SECRET=<span className="text-text select-all">{secret}</span>
      </p>
      <p className="mt-2 text-xs text-muted">
        Replace YOUR_TABLE with any table the anon key can read. Point this target at that
        route&apos;s URL.
      </p>
    </div>
  );
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { error, added, queued } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, repo_url, targets (id, url, platform, heartbeat_type, interval_seconds, secret)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const targets = (project.targets ?? []) as Target[];
  const limits = await entitlements(user.id);
  const { health, days } = await loadHealth(
    supabase,
    targets.map((t) => t.id),
  );
  const now = Date.now();
  const newTarget = targets.find((t) => t.id === added);

  return (
    <main className="w-full flex-1 px-6 py-12 sm:px-10 lg:px-16">
      <Link href="/dashboard" className="font-mono text-xs text-muted hover:text-text">
        ← dashboard
      </Link>
      <div className="mt-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-medium">{project.name}</h1>
        {project.repo_url && (
          <a href={project.repo_url} className="font-mono text-xs text-muted hover:text-text">
            github ↗
          </a>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 max-w-2xl border border-dead/40 bg-dead/10 px-3 py-2 font-mono text-xs text-dead"
        >
          {error}
        </p>
      )}
      {queued && (
        <p
          role="status"
          className="mt-6 max-w-2xl border border-alive/40 bg-alive/10 px-3 py-2 font-mono text-xs text-alive"
        >
          Queued. The engine pings it on its next tick, within a minute. Refresh to see the result.
        </p>
      )}
      {newTarget?.platform === "custom" &&
        newTarget.heartbeat_type === "db_query" &&
        newTarget.secret && <Snippet secret={newTarget.secret} />}

      <section className="mt-10">
        <h2 className="font-mono text-xs tracking-wide text-muted uppercase">Targets</h2>
        {targets.length === 0 ? (
          <p className="mt-4 font-mono text-xs text-muted">
            no targets yet — nothing here is being kept alive
          </p>
        ) : (
          <ul className="mt-4 border border-line bg-surface">
            {targets.map((t) => (
              <TargetRow
                key={t.id}
                target={t}
                health={health.get(t.id)}
                days={days.get(t.id) ?? []}
                now={now}
              >
                <form action={testTarget}>
                  <input type="hidden" name="target_id" value={t.id} />
                  <button type="submit" className="font-mono text-xs text-accent hover:underline">
                    test now
                  </button>
                </form>
                <form action={removeTarget}>
                  <input type="hidden" name="target_id" value={t.id} />
                  <button type="submit" className="font-mono text-xs text-muted hover:text-dead">
                    remove
                  </button>
                </form>
              </TargetRow>
            ))}
          </ul>
        )}
      </section>

      <TargetForms
        projectId={project.id}
        minInterval={limits.minInterval()}
        heartbeatTypes={limits.allowedHeartbeatTypes()}
      />
    </main>
  );
}
