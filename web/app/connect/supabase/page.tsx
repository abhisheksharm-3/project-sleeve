import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/app/components/app-header";
import { Window } from "@/app/components/window";
import { provisionSupabase } from "@/app/projects/actions";
import { unseal } from "@/lib/sealed";
import { requireUser } from "@/lib/session";
import { type ActiveConnect, CONNECT_COOKIE, connectConfig } from "@/lib/supabase-connect";
import { listProjects, type SupabaseProject } from "@/lib/supabase-mgmt";

/** One-click Supabase setup, step one: choose which of your Supabase projects to keep awake. */
export default async function ConnectSupabasePage() {
  const session = await requireUser();
  const config = connectConfig();
  const active = config
    ? unseal<ActiveConnect>((await cookies()).get(CONNECT_COOKIE)?.value, config.clientSecret)
    : null;
  if (!active || active.userId !== session.user.id) redirect("/dashboard");

  let projects: SupabaseProject[] = [];
  let problem: string | null = null;
  try {
    projects = await listProjects(active.token);
  } catch (e) {
    problem = e instanceof Error ? e.message : "Could not list your Supabase projects.";
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader session={session} />
      <main className="w-full max-w-3xl flex-1 px-6 pb-16 sm:px-10 lg:px-16">
        <Link href={`/projects/${active.projectId}`} className="text-sm text-muted hover:text-text">
          Back to the project
        </Link>
        <h1 className="mt-6 text-4xl font-semibold">Which Supabase project?</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          We will install the keepalive() function in the one you choose, read its public key, and
          start checking it. Nothing else in the project is touched, and we do not keep access to
          your Supabase account.
        </p>
        {problem && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-dead/40 bg-dead/10 px-4 py-3 text-[15px] text-dead"
          >
            {problem}
          </p>
        )}
        <ul className="mt-8 space-y-3">
          {projects.map((p) => {
            const paused = p.status !== "ACTIVE_HEALTHY";
            return (
              <li
                key={p.ref}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-5"
              >
                <Window state={paused ? "paused" : "alive"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{p.name}</span>
                  <span className="block text-sm text-muted">
                    {p.ref}, {p.region}
                    {paused ? `. ${p.status.toLowerCase().replace(/_/g, " ")}` : ""}
                  </span>
                </span>
                {paused ? (
                  <a
                    href={`https://supabase.com/dashboard/project/${p.ref}`}
                    className="text-sm font-semibold text-dead underline underline-offset-4"
                  >
                    Restore it first
                  </a>
                ) : (
                  <form action={provisionSupabase}>
                    <input type="hidden" name="ref" value={p.ref} />
                    <button
                      type="submit"
                      className="rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn"
                    >
                      Keep this one awake
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
