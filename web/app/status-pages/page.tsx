import Link from "next/link";
import { AppHeader } from "@/app/components/app-header";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { createStatusPage } from "./actions";

/** The user's status pages, and a one-field form to start another. */
export default async function StatusPagesPage({ searchParams }: PageProps<"/status-pages">) {
  const session = await requireUser();
  const { error } = await searchParams;
  const { data: pages } = await session.supabase
    .from("status_pages")
    .select("id, slug, title, published, status_page_items (target_id)")
    .order("created_at");
  const host = siteUrl().replace(/^https?:\/\//, "");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader session={session} />
      <main className="w-full flex-1 px-6 pb-16 sm:px-10 lg:px-16">
        <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Status pages</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          A public page that shows visitors whether your backends are up, their uptime over 90 days,
          response times, outages, and any notice you post. You choose which backends it shows and
          what each is called.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-8 max-w-2xl rounded-xl border border-dead/40 bg-dead/10 px-4 py-3 text-[15px] text-dead"
          >
            {error}
          </p>
        )}

        {(pages ?? []).length > 0 && (
          <ul className="mt-10 max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
            {(pages ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <Link
                    href={`/status-pages/${p.id}`}
                    className="text-[17px] font-semibold hover:text-alive"
                  >
                    {p.title}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {host}/s/{p.slug}, {p.status_page_items.length}{" "}
                    {p.status_page_items.length === 1 ? "backend" : "backends"}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium ${p.published ? "text-alive" : "text-muted"}`}
                >
                  {p.published ? "Published" : "Draft"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form action={createStatusPage} className="mt-12 max-w-xl">
          <label htmlFor="title" className="text-xl font-semibold">
            {(pages ?? []).length ? "Make another page" : "Make your first page"}
          </label>
          <p className="mt-1 text-[15px] text-muted">
            Name it for its visitors. You pick what goes on it next.
          </p>
          <div className="mt-5 flex gap-3">
            <input
              id="title"
              name="title"
              required
              maxLength={80}
              placeholder="My side projects"
              className="flex-1 rounded-xl border border-line bg-ink px-4 py-2.5 text-[15px] placeholder:text-muted/50 focus:border-alive/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn"
            >
              Create page
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
