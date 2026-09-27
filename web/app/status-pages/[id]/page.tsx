import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/app/components/app-header";
import { targetTitle } from "@/lib/describe";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import {
  closeNotice,
  deleteStatusPage,
  postNotice,
  saveStatusPage,
  setPublished,
} from "../actions";

/** Editing one status page: its address and wording, which backends it shows, and notices. */
type Target = { id: string; url: string; platform: string; heartbeat_type: string };

const field =
  "w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-[15px] placeholder:text-muted/50 focus:border-alive/60 focus:outline-none";
const quiet =
  "rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-muted/60";

const TOGGLES = [
  { name: "show_uptime", label: "Uptime percentages", hint: "7, 30 and 90 days per backend." },
  { name: "show_response_time", label: "Response times", hint: "Average, with a 30-day line." },
  { name: "show_outages", label: "Outage history", hint: "Each outage and how long it lasted." },
] as const;

export default async function StatusPageEditor({
  params,
  searchParams,
}: PageProps<"/status-pages/[id]">) {
  const session = await requireUser();
  const { supabase } = session;
  const { id } = await params;
  const { error, saved } = await searchParams;

  const [{ data: page }, { data: projects }] = await Promise.all([
    supabase
      .from("status_pages")
      .select(
        "id, slug, title, description, published, show_uptime, show_response_time, show_outages, status_page_items (target_id, label, position), status_page_notices (id, kind, title, body, created_at, resolved_at)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id, name, targets (id, url, platform, heartbeat_type)")
      .eq("archived", false)
      .order("created_at"),
  ]);
  if (!page) notFound();

  const chosen = new Map(page.status_page_items.map((i) => [i.target_id, i.label]));
  const notices = [...page.status_page_notices].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const address = `${siteUrl()}/s/${page.slug}`;
  const withTargets = (projects ?? []).filter((p) => (p.targets ?? []).length > 0);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader session={session} />
      <main className="w-full flex-1 px-6 pb-20 sm:px-10 lg:px-16">
        <Link href="/status-pages" className="text-sm text-muted hover:text-text">
          Back to status pages
        </Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-4xl font-semibold sm:text-5xl">{page.title}</h1>
            <p className="mt-2 text-[15px] text-muted">
              {page.published ? "Published at " : "Draft. It will live at "}
              <a
                href={`/s/${page.slug}`}
                className="text-text underline decoration-line underline-offset-4 hover:text-alive"
              >
                {address}
              </a>
            </p>
          </div>
          <form action={setPublished}>
            <input type="hidden" name="page_id" value={page.id} />
            <input type="hidden" name="published" value={String(!page.published)} />
            <button
              type="submit"
              className={
                page.published
                  ? `${quiet} hover:border-dead/60 hover:text-dead`
                  : "rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn"
              }
            >
              {page.published ? "Unpublish" : "Publish page"}
            </button>
          </form>
        </div>

        {(error || saved) && (
          <p
            role={error ? "alert" : "status"}
            className={`mt-8 max-w-3xl rounded-xl border px-4 py-3 text-[15px] ${
              error
                ? "border-dead/40 bg-dead/10 text-dead"
                : "border-alive/40 bg-alive/10 text-alive"
            }`}
          >
            {error ?? "Saved. The page shows your changes now."}
          </p>
        )}

        <form action={saveStatusPage} className="mt-12 grid max-w-5xl gap-14">
          <input type="hidden" name="page_id" value={page.id} />

          <section className="grid gap-5 sm:grid-cols-2">
            <h2 className="text-xl font-semibold sm:col-span-2">The page</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Title</span>
              <input
                name="title"
                required
                maxLength={80}
                defaultValue={page.title}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Address</span>
              <span className="flex items-center rounded-xl border border-line bg-ink focus-within:border-alive/60">
                <span className="pl-4 text-[15px] text-muted">/s/</span>
                <input
                  name="slug"
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
                  defaultValue={page.slug}
                  className="w-full bg-transparent py-2.5 pr-4 pl-0.5 text-[15px] focus:outline-none"
                />
              </span>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm text-muted">
                Description, shown under the title
              </span>
              <textarea
                name="description"
                maxLength={280}
                rows={2}
                defaultValue={page.description ?? ""}
                placeholder="Live status for the apps I run on free tiers."
                className={field}
              />
            </label>
          </section>

          <section>
            <h2 className="text-xl font-semibold">What it shows</h2>
            <p className="mt-1 text-[15px] text-muted">
              Tick the backends to show. Visitors see the name you give each one, never its URL.
            </p>
            {withTargets.length === 0 ? (
              <p className="mt-5 text-[15px] text-warn">
                None of your projects has a backend yet.{" "}
                <Link href="/dashboard" className="underline underline-offset-4">
                  Add one first
                </Link>
                .
              </p>
            ) : (
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                {withTargets.map((p) => (
                  <fieldset key={p.id} className="rounded-2xl border border-line bg-surface p-5">
                    <legend className="px-1 text-[15px] font-semibold">
                      {p.name.split("/").pop()}
                    </legend>
                    <ul className="space-y-3">
                      {(p.targets as Target[]).map((t) => {
                        const title = targetTitle(t).title;
                        const repo = p.name.split("/").pop();
                        return (
                          <li
                            key={t.id}
                            className="grid gap-2 sm:grid-cols-[1fr_1.2fr] sm:items-center"
                          >
                            <label className="flex items-center gap-3 text-[15px]">
                              <input
                                type="checkbox"
                                name="target"
                                value={t.id}
                                defaultChecked={chosen.has(t.id)}
                                className="size-4 accent-[var(--color-alive)]"
                              />
                              {title}
                            </label>
                            <label>
                              <span className="sr-only">Name shown for {title}</span>
                              <input
                                name={`label_${t.id}`}
                                maxLength={60}
                                defaultValue={chosen.get(t.id) ?? ""}
                                placeholder={`${repo} ${title}`}
                                className={`${field} py-2 text-sm`}
                              />
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold">Details to show</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {TOGGLES.map((t) => (
                <label
                  key={t.name}
                  className="flex gap-3 rounded-2xl border border-line bg-surface p-4 has-checked:border-alive/50"
                >
                  <input
                    type="checkbox"
                    name={t.name}
                    defaultChecked={page[t.name]}
                    className="mt-1 size-4 accent-[var(--color-alive)]"
                  />
                  <span>
                    <span className="block text-[15px] font-semibold">{t.label}</span>
                    <span className="mt-0.5 block text-sm text-muted">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="rounded-full bg-alive px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-warn"
            >
              Save changes
            </button>
            <a
              href={`/s/${page.slug}`}
              className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-text"
            >
              View the page
            </a>
          </div>
        </form>

        <section id="notices" className="mt-20 max-w-5xl scroll-mt-8">
          <h2 className="text-xl font-semibold">Notices</h2>
          <p className="mt-1 text-[15px] text-muted">
            Tell visitors about an incident or planned maintenance. Open notices sit at the top of
            the page; resolved ones move to its history.
          </p>
          <form
            action={postNotice}
            className="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-[12rem_1fr]"
          >
            <input type="hidden" name="page_id" value={page.id} />
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Kind</span>
              <select name="kind" defaultValue="incident" className={field}>
                <option value="incident">Incident</option>
                <option value="maintenance">Maintenance</option>
                <option value="notice">Notice</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Title</span>
              <input
                name="title"
                required
                maxLength={120}
                placeholder="Database restarting at 22:00 UTC"
                className={field}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm text-muted">Details, optional</span>
              <textarea name="body" maxLength={2000} rows={3} className={field} />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn"
              >
                Post notice
              </button>
            </div>
          </form>

          {notices.length > 0 && (
            <ul className="mt-6 divide-y divide-line rounded-2xl border border-line">
              {notices.map((n) => (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">
                      {n.kind[0].toUpperCase() + n.kind.slice(1)},{" "}
                      {n.resolved_at ? "resolved" : "open"}
                    </p>
                    <p className="mt-0.5 text-[15px] font-semibold">{n.title}</p>
                  </div>
                  <form action={closeNotice} className="flex gap-2">
                    <input type="hidden" name="page_id" value={page.id} />
                    <input type="hidden" name="notice_id" value={n.id} />
                    {!n.resolved_at && (
                      <button type="submit" name="action" value="resolve" className={quiet}>
                        Mark resolved
                      </button>
                    )}
                    <button
                      type="submit"
                      name="action"
                      value="delete"
                      className={`${quiet} text-muted hover:border-dead/60 hover:text-dead`}
                    >
                      Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form action={deleteStatusPage} className="mt-20 max-w-5xl border-t border-line pt-8">
          <input type="hidden" name="page_id" value={page.id} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                name="confirm"
                required
                className="size-4 accent-[var(--color-dead)]"
              />
              Yes, delete it
            </label>
            <button
              type="submit"
              className={`${quiet} text-muted hover:border-dead/60 hover:text-dead`}
            >
              Delete this status page
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            The address stops working straight away. Your backends keep being kept awake.
          </p>
        </form>
      </main>
    </div>
  );
}
