import Link from "next/link";
import { Skyline } from "@/app/components/skyline";
import { Window } from "@/app/components/window";

export const metadata = {
  title: "ProjectSleeve — keeping the lights on",
  description:
    "Free-tier backends pause when nobody touches them. ProjectSleeve checks each one the way its platform actually counts, on a schedule that never switches itself off.",
};

/** Static and prerendered; the proxy sends signed-in visitors to their dashboard instead. */
const PAD = "px-6 sm:px-10 lg:px-16";

const REASONS = [
  {
    state: "paused" as const,
    title: "A page visit is not database activity",
    body: "Uptime monitors load your homepage and report 100%. Supabase counts queries, not visits, so the project pauses anyway.",
  },
  {
    state: "failing" as const,
    title: "Scheduled GitHub Actions switch themselves off",
    body: "GitHub disables scheduled workflows after 60 days without a commit. The quiet repository is exactly the one whose keep-alive stops first.",
  },
  {
    state: "idle" as const,
    title: "Nobody tells you it stopped",
    body: "A failing check and a paused project look the same from outside. We record every check, so your dashboard shows the problem days before the deadline.",
  },
];

const LEGEND = [
  {
    state: "alive" as const,
    name: "Lit",
    body: "The last check succeeded, and we know how long until the platform would pause it.",
  },
  {
    state: "failing" as const,
    name: "Flickering",
    body: "Checks are failing, or the pause deadline is less than two days away.",
  },
  {
    state: "paused" as const,
    name: "Dark",
    body: "The pause window passed without a successful check. Restore it on the platform and we take over again.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-sky via-ink to-ink">
      <div className="flex h-svh min-h-[34rem] flex-col">
        <header className={`flex items-center gap-2.5 py-5 ${PAD}`}>
          <Window state="alive" size="sm" />
          <span className="text-[15px] font-semibold tracking-tight">ProjectSleeve</span>
          <Link
            href="/login"
            className="ml-auto text-sm text-muted transition-colors hover:text-text"
          >
            Sign in
          </Link>
        </header>

        <section className={`flex min-h-0 flex-1 flex-col pt-[6vh] ${PAD}`}>
          <div className="shrink-0">
            <h1 className="max-w-4xl text-[clamp(2.5rem,min(7vw,9vh),5rem)] leading-[1.02] font-semibold">
              Keeping the lights on for the projects you are not touching.
            </h1>
            <p className="mt-[3vh] max-w-xl text-lg leading-relaxed text-muted">
              Supabase pauses a free project after a week of quiet. Render sleeps after fifteen
              minutes. We check each backend the way its platform actually counts, on a schedule
              that never switches itself off.
            </p>
            <div className="mt-[4vh] flex flex-wrap items-center gap-5">
              <Link
                href="/login"
                className="rounded-full bg-alive px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-warn"
              >
                Continue with GitHub
              </Link>
              <span className="text-sm text-muted">
                Reads your public repositories. Never your code.
              </span>
            </div>
          </div>
          <div className="mt-[5vh] flex min-h-24 flex-1 items-end overflow-hidden border-b-2 border-line [container-type:size]">
            <Skyline />
          </div>
        </section>
      </div>

      <main className="flex-1">
        <section className={`py-24 ${PAD}`}>
          <h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">
            Why the lights go out anyway
          </h2>
          <ul className="mt-12 grid gap-12 lg:grid-cols-3">
            {REASONS.map((r) => (
              <li key={r.title} className="flex gap-4">
                <Window state={r.state} size="lg" />
                <div>
                  <h3 className="text-lg font-semibold">{r.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{r.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={`border-t border-line py-24 ${PAD}`}>
          <h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">
            Every backend is a window
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            Each project you import is a building. Each database, service or Space inside it is a
            window, and you can read the whole night at a glance.
          </p>
          <dl className="mt-12 grid gap-10 sm:grid-cols-3">
            {LEGEND.map((l) => (
              <div key={l.name}>
                <dt className="flex items-center gap-3 text-lg font-semibold">
                  <Window state={l.state} />
                  {l.name}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-muted">{l.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={`border-t border-line py-24 ${PAD}`}>
          <h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">What we cannot do</h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            We keep a light on; we cannot switch one back on. Supabase has no way to resume a paused
            project from outside, so if yours is already asleep, restore it in your dashboard first.
            From then on, it stays lit.
          </p>
          <Link
            href="/login"
            className="mt-10 inline-block rounded-full bg-alive px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-warn"
          >
            Continue with GitHub
          </Link>
        </section>
      </main>

      <footer className={`border-t border-line py-8 text-sm text-muted ${PAD}`}>
        We store the status, timing and outcome of each check. Never your data, and never a response
        body.
      </footer>
    </div>
  );
}
