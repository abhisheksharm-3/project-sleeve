import { AppHeader } from "@/app/components/app-header";
import { requireUser } from "@/lib/session";
import { removeChannel, saveChannel, sendTest } from "./actions";

/** Where alerts and the Monday digest go: one Discord or Slack webhook. */
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const session = await requireUser();
  const { error, saved, tested, removed } = await searchParams;
  const { data: channel } = await session.supabase
    .from("notification_channels")
    .select("kind, webhook_url, alerts, digest, last_digest_at")
    .maybeSingle();
  const notice = error
    ? { tone: "border-dead/40 bg-dead/10 text-dead", text: error }
    : saved
      ? { tone: "border-alive/40 bg-alive/10 text-alive", text: "Saved. Send a test to check it." }
      : tested
        ? {
            tone: "border-alive/40 bg-alive/10 text-alive",
            text: "Test sent. Look in your channel.",
          }
        : removed
          ? {
              tone: "border-line bg-surface text-muted",
              text: "Webhook removed. Nothing will be sent.",
            }
          : null;
  const toggle =
    "flex gap-3 rounded-2xl border border-line bg-surface p-4 has-checked:border-alive/50";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader session={session} />
      <main className="w-full max-w-3xl flex-1 px-6 pb-20 sm:px-10 lg:px-16">
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">Notifications</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Get told when a backend starts failing or is close to pausing, and a short summary every
          Monday. Paste an incoming webhook from a Discord or Slack channel.
        </p>

        {notice && (
          <p
            role={error ? "alert" : "status"}
            className={`mt-8 rounded-xl border px-4 py-3 text-[15px] ${notice.tone}`}
          >
            {String(notice.text)}
          </p>
        )}

        <form action={saveChannel} className="mt-10 space-y-6">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Webhook URL</span>
            <input
              name="webhook_url"
              type="url"
              required
              defaultValue={channel?.webhook_url ?? ""}
              placeholder="https://discord.com/api/webhooks/… or https://hooks.slack.com/services/…"
              autoComplete="off"
              className="w-full rounded-xl border border-line bg-ink px-4 py-2.5 font-mono text-[13px] placeholder:font-sans placeholder:text-[15px] placeholder:text-muted/50 focus:border-alive/60 focus:outline-none"
            />
            <span className="mt-2 block text-sm text-muted">
              Discord: channel settings, Integrations, Webhooks. Slack: an app with Incoming
              Webhooks turned on.
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={toggle}>
              <input
                type="checkbox"
                name="alerts"
                defaultChecked={channel?.alerts ?? true}
                className="mt-1 size-4 accent-[var(--color-alive)]"
              />
              <span>
                <span className="block text-[15px] font-semibold">Alerts</span>
                <span className="mt-0.5 block text-sm text-muted">
                  Failing checks, a pause within 48 hours, or a pause that happened.
                </span>
              </span>
            </label>
            <label className={toggle}>
              <input
                type="checkbox"
                name="digest"
                defaultChecked={channel?.digest ?? true}
                className="mt-1 size-4 accent-[var(--color-alive)]"
              />
              <span>
                <span className="block text-[15px] font-semibold">Monday digest</span>
                <span className="mt-0.5 block text-sm text-muted">
                  The week&apos;s checks, the nearest deadline, and stopped keep-alive workflows.
                </span>
              </span>
            </label>
          </div>
          <button
            type="submit"
            className="rounded-full bg-alive px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-warn"
          >
            Save webhook
          </button>
        </form>

        {channel && (
          <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-line pt-8">
            <form action={sendTest}>
              <button
                type="submit"
                className="rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-alive/60 hover:text-alive"
              >
                Send a test message
              </button>
            </form>
            <form action={removeChannel}>
              <button
                type="submit"
                className="rounded-full border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-dead/60 hover:text-dead"
              >
                Remove webhook
              </button>
            </form>
            {channel.last_digest_at && (
              <span className="text-sm text-muted">
                Last digest {new Date(channel.last_digest_at).toDateString()}
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
