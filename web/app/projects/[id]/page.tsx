import Link from "next/link";
import { notFound } from "next/navigation";
import { addTarget, removeTarget, testTarget } from "@/app/projects/actions";
import { entitlements } from "@/lib/entitlements";
import { ago, every } from "@/lib/format";
import { requireUser } from "@/lib/session";

/** One project: its targets, their last outcome, and the forms to add more. */
type Target = {
  id: string;
  url: string;
  platform: string;
  heartbeat_type: string;
  interval_seconds: number;
  secret: string | null;
};
type Ping = {
  target_id: string;
  ok: boolean;
  status_code: number | null;
  error: string | null;
  ran_at: string;
};

const FIELD =
  "w-full border border-line bg-ink px-3 py-2 font-mono text-sm placeholder:text-muted/60";
const BUTTON = "border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-raised";
const LABEL = "mb-1.5 block font-mono text-xs text-muted";

function IntervalField({ min }: { min: number }) {
  return (
    <div>
      <label className={LABEL} htmlFor="interval_seconds">
        cadence
      </label>
      <select
        id="interval_seconds"
        name="interval_seconds"
        className={FIELD}
        defaultValue={String(Math.max(min, 21600))}
      >
        {[21600, 43200, 86400]
          .filter((s) => s >= min)
          .map((s) => (
            <option key={s} value={s}>
              {every(s)}
            </option>
          ))}
      </select>
    </div>
  );
}

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
  const latest = new Map<string, Ping>();
  if (targets.length) {
    const { data: pings } = await supabase
      .from("ping_log")
      .select("target_id, ok, status_code, error, ran_at")
      .in(
        "target_id",
        targets.map((t) => t.id),
      )
      .order("ran_at", { ascending: false })
      .limit(targets.length * 10);
    for (const p of (pings ?? []) as Ping[])
      if (!latest.has(p.target_id)) latest.set(p.target_id, p);
  }
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
            {targets.map((t) => {
              const ping = latest.get(t.id);
              const state = !ping ? "idle" : ping.ok ? "alive" : "dead";
              const dot =
                state === "alive" ? "bg-alive pulse" : state === "dead" ? "bg-dead" : "bg-muted";
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/60 px-4 py-3 last:border-b-0"
                >
                  <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{t.url}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {t.platform} · {t.heartbeat_type} · {every(t.interval_seconds)}
                  </span>
                  <span
                    className={`w-36 shrink-0 text-right font-mono text-xs ${state === "dead" ? "text-dead" : "text-muted"}`}
                  >
                    {ping
                      ? `${ping.status_code ?? ping.error ?? "err"} · ${ago(ping.ran_at)}`
                      : "never pinged"}
                  </span>
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
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-14 grid gap-12 lg:grid-cols-2">
        <form action={addTarget} className="space-y-4">
          <input type="hidden" name="project_id" value={project.id} />
          <input type="hidden" name="kind" value="supabase" />
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            Keep a Supabase project awake
          </h2>
          <p className="text-sm text-muted">
            We read one row from a table through its REST API, which is a real query and resets the
            pause clock. The <span className="font-mono">/rest/v1/</span> root does not work: it
            refuses anon keys.
          </p>
          <div>
            <label className={LABEL} htmlFor="project_url">
              project url
            </label>
            <input
              id="project_url"
              name="project_url"
              required
              placeholder="https://abcdefghijklmnopqrst.supabase.co"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="anon_key">
              anon key — never the service-role key
            </label>
            <input
              id="anon_key"
              name="anon_key"
              required
              autoComplete="off"
              placeholder="eyJhbGciOi… or sb_publishable_…"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="table">
              any table the anon key can read
            </label>
            <input id="table" name="table" required placeholder="profiles" className={FIELD} />
          </div>
          <IntervalField min={limits.minInterval()} />
          <button type="submit" className={BUTTON}>
            Add Supabase target
          </button>
        </form>

        <form action={addTarget} className="space-y-4">
          <input type="hidden" name="project_id" value={project.id} />
          <input type="hidden" name="kind" value="custom" />
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            Any other backend
          </h2>
          <p className="text-sm text-muted">
            Choose <span className="font-mono">db_query</span> and we give you a small route to add
            to your app, so every ping runs a real query. <span className="font-mono">plain</span>{" "}
            only proves the URL answers.
          </p>
          <div>
            <label className={LABEL} htmlFor="url">
              url
            </label>
            <input
              id="url"
              name="url"
              type="url"
              required
              placeholder="https://my-app.onrender.com/api/keepalive"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="heartbeat_type">
              heartbeat
            </label>
            <select
              id="heartbeat_type"
              name="heartbeat_type"
              className={FIELD}
              defaultValue="db_query"
            >
              {limits.allowedHeartbeatTypes().map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <IntervalField min={limits.minInterval()} />
          <button type="submit" className={BUTTON}>
            Add target
          </button>
        </form>
      </section>
    </main>
  );
}
