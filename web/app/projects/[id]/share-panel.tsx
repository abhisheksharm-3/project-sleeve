/** Publishing a status page and README badge for one project. Off until the owner turns it on. */
import { setPublic } from "@/app/projects/actions";
import { siteUrl } from "@/lib/site-url";

export function SharePanel({ projectId, isPublic }: { projectId: string; isPublic: boolean }) {
  const base = siteUrl();
  const page = `${base}/status/${projectId}`;
  const badge = `${base}/badge/${projectId}`;
  const markdown = `[![Kept awake](${badge})](${page})`;
  return (
    <section id="share" className="mt-14 scroll-mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">Share its status</h2>
        <form action={setPublic}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="public" value={String(!isPublic)} />
          <button
            type="submit"
            className={
              isPublic
                ? "rounded-full border border-line px-4 py-2 text-sm hover:border-dead/60 hover:text-dead"
                : "rounded-full bg-alive px-4 py-2 text-sm font-semibold text-ink hover:bg-warn"
            }
          >
            {isPublic ? "Stop sharing" : "Publish a status page"}
          </button>
        </form>
      </div>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        {isPublic
          ? "Anyone with the link can see this project's name, the kind of each backend, whether it is awake, and its uptime. Never a URL or a key."
          : "Show visitors, or your README, that this project is awake. It shares the project's name, each backend's kind and state, and uptime; never a URL or a key."}
      </p>
      {isPublic && (
        <div className="mt-5 space-y-4 rounded-2xl border border-line bg-surface p-6">
          <p className="text-[15px]">
            Status page:{" "}
            <a href={page} className="text-alive underline underline-offset-4">
              {page}
            </a>
          </p>
          <div>
            <p className="mb-2 text-sm text-muted">README badge</p>
            <pre className="overflow-x-auto rounded-xl border border-line bg-ink p-3 font-mono text-[13px] select-all">
              {markdown}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
