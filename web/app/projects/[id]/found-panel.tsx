/** What the repository scan found: backends to keep awake, and keep-alive jobs that died. */
import Link from "next/link";
import { rescanProject } from "@/app/projects/actions";
import { ago } from "@/lib/format";
import type { RepoScan } from "@/lib/repo-scan";

type Suggestion = {
  key: string;
  title: string;
  detail: string;
  source: string;
  href: string;
  covered: boolean;
};

function host(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function suggestions(scan: RepoScan, keptHosts: Set<string>): Suggestion[] {
  const q = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}#add`;
  return [
    ...scan.supabase.map((s) => ({
      key: s.url,
      title: "Supabase database",
      detail: host(s.url).split(".")[0],
      source: s.source,
      href: q({ add: "supabase", project_url: s.url }),
      covered: keptHosts.has(host(s.url)),
    })),
    ...scan.render.map((r) => ({
      key: r.url,
      title: "Render service",
      detail: host(r.url),
      source: r.source,
      href: q({ add: "render", url: r.url }),
      covered: keptHosts.has(host(r.url)),
    })),
    ...scan.huggingface.map((h) => ({
      key: h.id,
      title: "Hugging Face Space",
      detail: h.id,
      source: h.source,
      href: q({ add: "huggingface", space: h.id }),
      covered: [...keptHosts].some((k) => k.startsWith(h.id.replace("/", "-").toLowerCase())),
    })),
    ...scan.appwrite.map((a) => ({
      key: a.endpoint,
      title: "Appwrite project",
      detail: a.projectId ?? host(a.endpoint),
      source: a.source,
      href: q({
        add: "appwrite",
        endpoint: a.endpoint,
        ...(a.projectId ? { appwrite_project: a.projectId } : {}),
      }),
      covered: keptHosts.has(host(a.endpoint)),
    })),
  ];
}

export function FoundPanel({
  projectId,
  scan,
  scannedAt,
  fromGithub,
  keptUrls,
}: {
  projectId: string;
  scan: RepoScan | null;
  scannedAt: string | null;
  fromGithub: boolean;
  keptUrls: string[];
}) {
  if (!fromGithub) return null;
  const kept = new Set(keptUrls.map(host));
  const found = scan ? suggestions(scan, kept) : [];
  const rescan = (
    <form action={rescanProject}>
      <input type="hidden" name="project_id" value={projectId} />
      <button
        type="submit"
        className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-text"
      >
        {scan ? "Scan again" : "Scan the repository"}
      </button>
    </form>
  );

  return (
    <section id="found" className="mt-12 scroll-mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">Found in the repository</h2>
        <span className="flex items-baseline gap-4 text-sm text-muted">
          {scannedAt && <span>Scanned {ago(scannedAt)}</span>}
          {rescan}
        </span>
      </div>

      {!scan ? (
        <p className="mt-2 text-[15px] text-muted">
          We can read this repository&apos;s config files for backends to keep awake, and check for
          keep-alive jobs that have stopped.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {scan.workflows.map((w) => (
            <div
              key={w.path}
              className={`rounded-2xl border p-5 ${w.state === "active" ? "border-warn/40 bg-warn/5" : "border-dead/40 bg-dead/10"}`}
            >
              <p
                className={`text-[15px] font-semibold ${w.state === "active" ? "text-warn" : "text-dead"}`}
              >
                {w.state === "active"
                  ? `Your “${w.name}” workflow is running, for now.`
                  : `GitHub switched off your “${w.name}” workflow.`}
              </p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-text/90">
                {w.state === "disabled_inactivity"
                  ? `It was disabled because the repository had no commits for 60 days.${w.lastRunAt ? ` Its last run was ${ago(w.lastRunAt)}, on ${new Date(w.lastRunAt).toDateString()}. Nothing it was pinging has been kept awake since.` : ""}`
                  : w.state === "active"
                    ? `GitHub disables scheduled workflows after 60 days without a commit, so it stops exactly when the project goes quiet.${w.lastRunAt ? ` Last run ${ago(w.lastRunAt)}.` : ""}`
                    : `Its state is ${w.state.replace(/_/g, " ")}.${w.lastRunAt ? ` Last run ${ago(w.lastRunAt)}.` : ""}`}
              </p>
              <p className="mt-1 text-sm text-muted">{w.path}</p>
            </div>
          ))}

          {found.length === 0 && scan.workflows.length === 0 && (
            <p className="text-[15px] text-muted">
              Nothing in the public config files. That is normal when keys live only in environment
              variables; add the backend below.
            </p>
          )}

          {found.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {found.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">
                      {f.title} <span className="font-normal text-muted">{f.detail}</span>
                    </span>
                    <span className="block text-sm text-muted">Named in {f.source}</span>
                  </span>
                  {f.covered ? (
                    <span className="text-sm text-alive">Already kept awake</span>
                  ) : (
                    <Link
                      href={f.href}
                      scroll={false}
                      className="rounded-full bg-alive px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-warn"
                    >
                      Keep it awake
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
