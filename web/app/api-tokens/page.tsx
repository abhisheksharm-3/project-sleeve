import { AppHeader } from "@/app/components/app-header";
import { ago } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { revokeApiToken } from "./actions";
import { CreateToken } from "./create-token";

/** Personal API tokens, and the calls they unlock, with copy-ready examples. */
export default async function ApiTokensPage() {
  const session = await requireUser();
  const { data: tokens } = await session.supabase
    .from("api_tokens")
    .select("id, name, prefix, created_at, last_used_at")
    .order("created_at", { ascending: false });
  const base = `${siteUrl()}/api/v1`;
  const examples = [
    {
      title: "List your projects and their ids",
      code: `curl -H "Authorization: Bearer $SLEEVE_TOKEN" ${base}/projects`,
    },
    {
      title: "Keep a preview deployment checked",
      code: `curl -X POST ${base}/targets \\\n  -H "Authorization: Bearer $SLEEVE_TOKEN" -H "content-type: application/json" \\\n  -d '{"project_id":"<id>","kind":"website","url":"https://my-pr-42.vercel.app"}'`,
    },
    {
      title: "Add a heartbeat for a job",
      code: `curl -X POST ${base}/targets \\\n  -H "Authorization: Bearer $SLEEVE_TOKEN" -H "content-type: application/json" \\\n  -d '{"project_id":"<id>","kind":"heartbeat","label":"Nightly backup","interval_seconds":86400}'`,
    },
    {
      title: "Remove it when the preview is torn down",
      code: `curl -X DELETE "${base}/targets?url=https://my-pr-42.vercel.app" \\\n  -H "Authorization: Bearer $SLEEVE_TOKEN"`,
    },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader session={session} />
      <main className="w-full max-w-4xl flex-1 px-6 pb-20 sm:px-10 lg:px-16">
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">API tokens</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Add and remove backends from a script or CI, for example checking each preview deployment
          while it is up. A token acts as you, so keep it in your CI&apos;s secrets.
        </p>

        <CreateToken />

        {(tokens ?? []).length > 0 && (
          <ul className="mt-10 border-t border-line">
            {(tokens ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line py-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{t.name}</span>
                  <span className="block font-mono text-[13px] text-muted">{t.prefix}…</span>
                </span>
                <span className="text-sm text-muted">
                  {t.last_used_at ? `Used ${ago(t.last_used_at)}` : "Never used"}
                </span>
                <form action={revokeApiToken}>
                  <input type="hidden" name="token_id" value={t.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-line px-4 py-1.5 text-sm text-muted transition-colors hover:border-dead/60 hover:text-dead"
                  >
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <section className="mt-16">
          <h2 className="text-xl font-semibold">Using it</h2>
          <div className="mt-5 space-y-6">
            {examples.map((e) => (
              <div key={e.title}>
                <p className="mb-2 text-sm text-muted">{e.title}</p>
                <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed">
                  {e.code}
                </pre>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
