import Link from "next/link";
import { notFound } from "next/navigation";
import { Window } from "@/app/components/window";
import { loadPublicStatus } from "@/lib/public-status";

/** A project's public status page: its windows, and nothing that identifies its infrastructure. */
export default async function StatusPage({ params }: PageProps<"/status/[id]">) {
  const { id } = await params;
  const status = await loadPublicStatus(id);
  if (!status) notFound();

  return (
    <main className="flex min-h-full flex-1 flex-col px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-2xl flex-1">
        <p className="text-sm text-muted">Status</p>
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">{status.name}</h1>
        <p className={`mt-4 text-lg ${status.allAwake ? "text-alive" : "text-dead"}`}>
          {status.backends.length === 0
            ? "Nothing is being monitored yet."
            : status.allAwake
              ? "Every backend is awake."
              : "Something here needs attention."}
          {status.rate !== null && (
            <span className="text-muted"> {status.rate}% of checks passed this week.</span>
          )}
        </p>
        <div className="mt-10 rounded-t-2xl border border-b-0 border-line bg-surface p-6">
          <ul className="space-y-4">
            {status.backends.map((b) => (
              <li key={b.slot} className="flex items-center gap-4">
                <Window state={b.state} size="lg" />
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">{b.title}</span>
                  <span className="block text-sm text-muted">{b.headline}</span>
                </span>
                <span className="text-sm text-muted tabular-nums">
                  {b.uptime === null ? "—" : `${b.uptime}%`}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t-2 border-line" />
      </div>
      <p className="mx-auto mt-12 w-full max-w-2xl text-sm text-muted">
        Kept awake by{" "}
        <Link href="/" className="underline decoration-line underline-offset-4 hover:text-text">
          ProjectSleeve
        </Link>
        .
      </p>
    </main>
  );
}
