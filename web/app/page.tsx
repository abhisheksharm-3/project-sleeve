import Link from "next/link";

export const metadata = {
  title: "ProjectSleeve — keep-alive that actually works",
  description:
    "Free-tier backends pause after a week of quiet. ProjectSleeve pings the thing that actually pauses, on a schedule that cannot switch itself off.",
};

/** Full bleed: rules and sections run edge to edge, and only the reading measure is capped. */
const PAD = "px-6 sm:px-10 lg:px-16";

function Row({
  state,
  url,
  meta,
  right,
}: {
  state: "alive" | "dead";
  url: string;
  meta: string;
  right: string;
}) {
  const dot = state === "alive" ? "bg-alive pulse" : "bg-dead";
  return (
    <li className="flex items-center gap-4 border-b border-line/60 px-4 py-3 last:border-b-0">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="truncate font-mono text-xs sm:text-sm">{url}</span>
      <span className="ml-auto hidden shrink-0 font-mono text-xs text-muted md:inline">{meta}</span>
      <span
        className={`w-28 shrink-0 text-right font-mono text-xs ${
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
      <header className={`flex items-center gap-2.5 border-b border-line py-4 ${PAD}`}>
        <span className="pulse size-2 rounded-full bg-alive" aria-hidden />
        <span className="font-mono text-sm tracking-tight">projectsleeve</span>
        <Link
          href="/login"
          className="ml-auto font-mono text-xs text-muted transition-colors hover:text-text"
        >
          sign in
        </Link>
      </header>

      <main className="flex-1">
        <section className={`border-b border-line py-24 lg:py-36 ${PAD}`}>
          <h1 className="max-w-5xl text-5xl leading-[1.05] font-medium sm:text-6xl lg:text-7xl">
            Your side project is asleep.
            <span className="block text-muted">You will find out from a user.</span>
          </h1>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted">
            Supabase pauses a free project after about a week of inactivity. Render spins a free
            service down in fifteen minutes. The demo you linked on your CV returns a cold start, or
            nothing at all.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Link
              href="/login"
              className="border border-line bg-surface px-5 py-3 text-sm font-medium transition-colors hover:border-muted/40 hover:bg-raised"
            >
              Continue with GitHub
            </Link>
            <span className="font-mono text-xs text-muted">read:user · free tier</span>
          </div>
        </section>

        <section className={`border-b border-line py-20 ${PAD}`}>
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            Why the usual fixes fail
          </h2>
          <dl className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-16">
            <div>
              <dt className="text-base font-medium">A URL ping is not a heartbeat</dt>
              <dd className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                Uptime monitors fetch your front page and report 100%. If the request never reaches
                your database, the clock that pauses your project never resets.
              </dd>
            </div>
            <div>
              <dt className="text-base font-medium">A cron job on GitHub switches itself off</dt>
              <dd className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                GitHub disables scheduled workflows after 60 days without a commit. The dormant repo
                is exactly the one whose keep-alive dies first, silently.
              </dd>
            </div>
            <div>
              <dt className="text-base font-medium">Nothing tells you it stopped</dt>
              <dd className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                A failing ping and a paused project look identical from outside. We record every
                outcome, so a pause is a measured event rather than a surprise.
              </dd>
            </div>
          </dl>
        </section>

        <section className={`border-b border-line py-20 ${PAD}`}>
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            What you actually see
          </h2>
          <div className="mt-8 border border-line bg-surface">
            <ul>
              <Row
                state="alive"
                url="nujgeowsnjculknvimbh.supabase.co/rest/v1/profiles?limit=1"
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
          <p className="mt-5 font-mono text-xs text-muted">
            one row per target · status, latency and outcome only · never your data
          </p>
        </section>

        <section className={`py-20 ${PAD}`}>
          <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
            One thing this cannot do
          </h2>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted">
            Keep-alive prevents a pause. It cannot undo one. Supabase offers no API to resume a
            paused project, so if yours is already asleep, wake it in your dashboard first, then
            connect it here. We would rather say that now than after you sign up.
          </p>
          <Link
            href="/login"
            className="mt-10 inline-block border border-line bg-surface px-5 py-3 text-sm font-medium transition-colors hover:border-muted/40 hover:bg-raised"
          >
            Continue with GitHub
          </Link>
        </section>
      </main>

      <footer className={`border-t border-line py-7 ${PAD}`}>
        <p className="font-mono text-xs text-muted">
          projectsleeve · status, latency and pause signals only
        </p>
      </footer>
    </>
  );
}
