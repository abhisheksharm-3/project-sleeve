import Link from "next/link";

export const metadata = {
  title: "ProjectSleeve — keep-alive that actually works",
  description:
    "Free-tier backends pause after a week of quiet. ProjectSleeve pings the thing that actually pauses, on a schedule that cannot switch itself off.",
};

/** Static: no session lookup, so the page is prerendered. Signed-in visitors are sent to
 *  /dashboard by the proxy before they ever see it. */
function Row({
  state,
  url,
  meta,
  right,
}: {
  state: "alive" | "dead" | "idle";
  url: string;
  meta: string;
  right: string;
}) {
  const dot = state === "alive" ? "bg-alive pulse" : state === "dead" ? "bg-dead" : "bg-muted";
  return (
    <li className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-b-0">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="truncate font-mono text-xs">{url}</span>
      <span className="ml-auto hidden shrink-0 font-mono text-xs text-muted sm:inline">{meta}</span>
      <span
        className={`w-24 shrink-0 text-right font-mono text-xs ${
          state === "dead" ? "text-dead" : "text-muted"
        }`}
      >
        {right}
      </span>
    </li>
  );
}

export default function LandingPage() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5 px-6 py-3.5">
          <span className="pulse size-2 rounded-full bg-alive" aria-hidden />
          <span className="font-mono text-sm tracking-tight">projectsleeve</span>
          <Link
            href="/login"
            className="ml-auto font-mono text-xs text-muted transition-colors hover:text-text"
          >
            sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6">
        <section className="border-b border-line py-20">
          <h1 className="max-w-2xl text-4xl leading-[1.1] font-medium sm:text-5xl">
            Your side project is asleep.
            <span className="block text-muted">You will find out from a user.</span>
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted">
            Supabase pauses a free project after about a week of inactivity. Render spins a free
            service down in fifteen minutes. The demo you linked on your CV returns a cold start, or
            nothing at all.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/login"
              className="border border-line bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:border-muted/40 hover:bg-raised"
            >
              Continue with GitHub
            </Link>
            <span className="font-mono text-xs text-muted">read:user · free tier</span>
          </div>
        </section>

        <section className="border-b border-line py-16">
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            Why the usual fixes fail
          </h2>
          <dl className="mt-8 grid gap-8 sm:grid-cols-3">
            <div>
              <dt className="text-sm font-medium">A URL ping is not a heartbeat</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">
                Uptime monitors fetch your front page and report 100%. If the request never reaches
                your database, the clock that pauses your project never resets.
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">A cron job on GitHub switches itself off</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">
                GitHub disables scheduled workflows after 60 days without a commit. The dormant repo
                is exactly the one whose keep-alive dies first, silently.
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Nothing tells you it stopped</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">
                A failing ping and a paused project look identical from outside. We record every
                outcome, so a pause is a measured event rather than a surprise.
              </dd>
            </div>
          </dl>
        </section>

        <section className="border-b border-line py-16">
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            What you actually see
          </h2>
          <div className="mt-6 border border-line bg-surface">
            <ul>
              <Row
                state="alive"
                url="nujgeows.supabase.co/rest/v1/profiles"
                meta="supabase · db_query · every 6h"
                right="200 · 2m ago"
              />
              <Row
                state="alive"
                url="inquora.vercel.app/"
                meta="custom · plain · every 6h"
                right="200 · 2m ago"
              />
              <Row
                state="dead"
                url="old-demo.onrender.com/health"
                meta="render · plain · every 10m"
                right="503 · 1m ago"
              />
            </ul>
          </div>
          <p className="mt-4 font-mono text-xs text-muted">
            one row per target · status, latency and outcome only · never your data
          </p>
        </section>

        <section className="py-16">
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            One thing this cannot do
          </h2>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted">
            Keep-alive prevents a pause. It cannot undo one. Supabase offers no API to resume a
            paused project, so if yours is already asleep, wake it in your dashboard first, then
            connect it here. We would rather say that now than after you sign up.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block border border-line bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:border-muted/40 hover:bg-raised"
          >
            Continue with GitHub
          </Link>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p className="font-mono text-xs text-muted">
            projectsleeve · status, latency and pause signals only
          </p>
        </div>
      </footer>
    </>
  );
}
