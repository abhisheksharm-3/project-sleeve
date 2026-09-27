import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/app/components/app-header";
import { TargetCard } from "@/app/components/target-card";
import { Window } from "@/app/components/window";
import { removeTarget, testTarget } from "@/app/projects/actions";
import { statusOf } from "@/lib/describe";
import { entitlements } from "@/lib/entitlements";
import { loadHealth } from "@/lib/load-health";
import { isRestoreLink } from "@/lib/probe";
import type { RepoScan } from "@/lib/repo-scan";
import { requireUser } from "@/lib/session";
import { FoundPanel } from "./found-panel";
import { SharePanel } from "./share-panel";
import { AddTarget, type Prefill } from "./target-forms";

/** One project: the backends kept awake, and a two-step way to add another. */
type Target = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
  secret: string | null;
  platform_ref: string | null;
  method: string;
};

const ROW_ACTION =
  "rounded-full border border-line px-4 py-1.5 text-sm transition-colors hover:border-alive/60 hover:text-alive";

/** The route a user drops into their own app so a db_query check runs a real query. */
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

const PREFILLABLE = ["project_url", "url", "space", "endpoint", "appwrite_project"];

/** Only the scan's known field names are carried from the query string into a form. */
function prefillFrom(query: Record<string, string | string[] | undefined>): Prefill {
  return Object.fromEntries(
    PREFILLABLE.map((k) => [k, typeof query[k] === "string" ? query[k] : undefined]),
  );
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const { error, added, queued, add, restore, checked } = query;
  const session = await requireUser();
  const { supabase, user } = session;

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, repo_url, github_id, scan, scanned_at, public, targets (id, url, platform, heartbeat_type, interval_seconds, secret, platform_ref, method)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const targets = (project.targets ?? []) as Target[];
  const [limits, { health, days }] = await Promise.all([
    entitlements(user.id),
    loadHealth(
      supabase,
      targets.map((t) => t.id),
    ),
  ]);
  const now = Date.now();
  const newTarget = targets.find((t) => t.id === added);
  const [owner, repo] = project.name.includes("/") ? project.name.split("/") : ["", project.name];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-sky to-ink">
      <AppHeader session={session} />
      <main className="w-full flex-1 px-6 pb-16 sm:px-10 lg:px-16">
        <Link href="/dashboard" className="text-sm text-muted hover:text-text">
          Back to all projects
        </Link>
        <section className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-semibold sm:text-5xl">{repo}</h1>
            <p className="mt-2 text-[15px] text-muted">
              {owner}
              {owner && project.repo_url && ". "}
              {project.repo_url && (
                <a
                  href={project.repo_url}
                  className="underline decoration-line underline-offset-4 hover:text-text"
                >
                  View the repository on GitHub
                </a>
              )}
            </p>
          </div>
          {targets.length > 0 && (
            <div
              aria-hidden
              className="flex gap-2 rounded-t-xl border border-b-0 border-line bg-surface px-4 pt-4 pb-3"
            >
              {targets.map((t) => (
                <Window key={t.id} state={statusOf(t, health.get(t.id), now).state} size="lg" />
              ))}
            </div>
          )}
        </section>

        {error && (
          <div
            role="alert"
            className="mt-8 max-w-2xl rounded-xl border border-dead/40 bg-dead/10 px-5 py-4 text-[15px] text-dead"
          >
            <p>
              <span className="font-semibold">Not saved.</span> {error}
            </p>
            {typeof restore === "string" && isRestoreLink(restore) && (
              <a
                href={restore}
                className="mt-2 inline-block font-semibold underline underline-offset-4"
              >
                Open the project to restore it
              </a>
            )}
          </div>
        )}
        {added && checked && (
          <p
            role="status"
            className="mt-8 max-w-2xl rounded-xl border border-alive/40 bg-alive/10 px-5 py-4 text-[15px] text-alive"
          >
            {checked === "waking"
              ? "Saved. It took a while to answer, which usually means it was asleep and is waking up now. The next check will confirm."
              : `Saved, and the first check passed (${checked}). It is being kept awake from now on.`}
          </p>
        )}
        {queued && (
          <p
            role="status"
            className="mt-8 max-w-2xl rounded-xl border border-alive/40 bg-alive/10 px-4 py-3 text-[15px] text-alive"
          >
            Check queued. It runs within a minute; refresh to see the result.
          </p>
        )}
        {newTarget?.platform === "custom" &&
          newTarget.heartbeat_type === "db_query" &&
          newTarget.secret && <Snippet secret={newTarget.secret} />}

        <section className="mt-10 border-t-2 border-line pt-10">
          <h2 className="text-xl font-semibold">What we keep awake</h2>
          {targets.length === 0 ? (
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Nothing yet. Add the backend that pauses when this project goes quiet. That is usually
              its database.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {targets.map((t) => (
                <TargetCard
                  key={t.id}
                  target={t}
                  health={health.get(t.id)}
                  days={days.get(t.id) ?? []}
                  now={now}
                >
                  <form action={testTarget}>
                    <input type="hidden" name="target_id" value={t.id} />
                    <button type="submit" className={ROW_ACTION}>
                      Check now
                    </button>
                  </form>
                  <form action={removeTarget}>
                    <input type="hidden" name="target_id" value={t.id} />
                    <button
                      type="submit"
                      className={`${ROW_ACTION} text-muted hover:border-dead/60 hover:text-dead`}
                    >
                      Remove
                    </button>
                  </form>
                </TargetCard>
              ))}
            </ul>
          )}
        </section>

        <FoundPanel
          projectId={project.id}
          scan={(project.scan as RepoScan | null) ?? null}
          scannedAt={project.scanned_at}
          fromGithub={project.github_id !== null}
          keptUrls={targets.map((t) => t.url)}
        />

        <section id="add" className="mt-14 scroll-mt-8">
          <h2 className="text-xl font-semibold">Add a backend</h2>
          <p className="mt-1 mb-5 text-[15px] text-muted">Where does this project run?</p>
          <AddTarget
            kind={typeof add === "string" ? add : undefined}
            projectId={project.id}
            minInterval={limits.minInterval()}
            heartbeatTypes={limits.allowedHeartbeatTypes()}
            prefill={prefillFrom(query)}
          />
        </section>
        <SharePanel projectId={project.id} isPublic={project.public} />
      </main>
    </div>
  );
}
