import Link from "next/link";
import { redirect } from "next/navigation";
import { DayWindows } from "@/app/components/day-windows";
import { Window } from "@/app/components/window";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { DayState } from "@/lib/uptime";

/**
 * Sign-in is a server action, so the page ships no client JavaScript at all.
 *
 * Scope is `read:user` only. Listing public repos needs nothing more, and asking for `repo`
 * at the door — read access to every private repository — is the kind of prompt that makes
 * a developer close the tab (spec §6).
 */
async function signInWithGitHub() {
  "use server";

  // The origin comes from configuration, never from request headers: a redirect_uri built
  // from an attacker-supplied Host would hand them the authorization code.
  const origin = siteUrl();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback`, scopes: "read:user" },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "sign_in_unavailable")}`);
  }
  redirect(data.url);
}

const STEPS = [
  "Pick the repositories to bring in. Each becomes a project.",
  "Tell us which backend each one depends on, or let the repo scan find it.",
  "We check each one on its platform's schedule, before it can pause.",
];

type Example = { name: string; kind: string; state: DayState[]; word: string; tone: string };

/** Illustrative rows for the preview, deterministic so the page prerenders the same way. */
function history(pattern: string): DayState[] {
  const map: Record<string, DayState> = { u: "up", p: "partial", d: "down", n: "none" };
  return [...pattern].map((c) => map[c]);
}

const EXAMPLES: Example[] = [
  {
    name: "side-project",
    kind: "Supabase database",
    state: history("nnnnnnuuuuuuuuuuuuuuuuuuuuuuuu"),
    word: "Awake",
    tone: "text-alive",
  },
  {
    name: "portfolio-api",
    kind: "Render service",
    state: history("uuuuuuuuuuuupuuuuuuuuuuuuuuuuu"),
    word: "Awake",
    tone: "text-alive",
  },
  {
    name: "hackathon-app",
    kind: "Appwrite project",
    state: history("uuuuuuuuuuuuuuuuuuuuuuuuuuuddu"),
    word: "Recovered",
    tone: "text-warn",
  },
  {
    name: "ml-demo",
    kind: "Hugging Face Space",
    state: history("nnnnnnnnnnnnnnnnuuuuuuuuuuuuuu"),
    word: "Awake",
    tone: "text-alive",
  },
];

function GitHubMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-[18px]" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const today = Date.parse("2026-01-30T12:00:00Z");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line">
        <div className="flex h-14 items-center px-6 sm:px-10 lg:px-16">
          <Link href="/" className="flex items-center gap-2.5">
            <Window state="alive" size="sm" />
            <span className="text-[15px] font-semibold tracking-tight">ProjectSleeve</span>
          </Link>
        </div>
      </header>
      <main className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="flex items-center px-6 py-16 sm:px-10 lg:px-16">
          <div className="w-full max-w-md">
            <h1 className="text-4xl leading-[1.1] font-semibold sm:text-5xl">
              Sign in and leave the lights to us.
            </h1>

            {error && (
              <p
                role="alert"
                className="mt-6 rounded-xl border border-dead/40 bg-dead/10 px-4 py-3 text-sm text-dead"
              >
                {error}
              </p>
            )}

            <form action={signInWithGitHub} className="mt-10">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2.5 rounded-full bg-alive px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-warn"
              >
                <GitHubMark />
                Continue with GitHub
              </button>
            </form>
            <p className="mt-3 text-sm text-muted">
              We ask for your public profile only, and never read your code.
            </p>

            <ol className="mt-12 space-y-4 border-t border-line pt-8">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-4 text-[15px] leading-relaxed text-muted">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-text tabular-nums"
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <aside
          aria-label="An example of the dashboard"
          className="hidden items-center border-l border-line bg-surface px-10 py-16 lg:flex xl:px-16"
        >
          <div className="w-full max-w-2xl">
            <p className="text-sm text-muted">What you will see, with example projects</p>
            <p className="mt-2 text-3xl font-semibold">All 4 lights are on.</p>
            <ul className="mt-8 border-t border-line">
              {EXAMPLES.map((e) => (
                <li key={e.name} className="border-b border-line py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[15px]">
                      <span className="font-semibold">{e.name}</span>{" "}
                      <span className="text-muted">{e.kind}</span>
                    </p>
                    <span className={`text-sm font-medium ${e.tone}`}>{e.word}</span>
                  </div>
                  <div className="mt-2.5">
                    <DayWindows
                      className="h-4"
                      cells={e.state.map((state, i) => ({
                        day: new Date(today - (29 - i) * 86_400_000).toISOString().slice(0, 10),
                        state,
                        uptime: null,
                      }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">
              Each window is a day. The hackathon app failed two days in a row and was caught before
              Appwrite paused it.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
