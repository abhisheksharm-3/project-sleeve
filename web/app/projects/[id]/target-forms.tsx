/** The add-target forms, one per platform, each asking only for what that platform needs. */
import Link from "next/link";
import { addTarget } from "@/app/projects/actions";
import { APPWRITE_COLUMN, APPWRITE_TABLE_NAME } from "@/lib/appwrite";
import { every } from "@/lib/format";
import { KEEPALIVE_SQL } from "@/lib/target-url";

const FIELD =
  "w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-[15px] placeholder:text-muted/50 focus:border-alive/60 focus:outline-none";
const BUTTON =
  "rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn";
const LABEL = "mb-1.5 block text-sm font-medium text-text/90";

function Hidden({ projectId, kind }: { projectId: string; kind: string }) {
  return (
    <>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="kind" value={kind} />
    </>
  );
}

function Field({
  id,
  label,
  ...rest
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className={LABEL} htmlFor={id}>
        {label}
      </label>
      <input id={id} name={id} required autoComplete="off" className={FIELD} {...rest} />
    </div>
  );
}

function IntervalField({ id, min }: { id: string; min: number }) {
  return (
    <div>
      <label className={LABEL} htmlFor={id}>
        cadence
      </label>
      <select
        id={id}
        name="interval_seconds"
        className={FIELD}
        defaultValue={String(Math.max(min, 21600))}
      >
        {[21600, 43200, 86400]
          .filter((s) => s >= min)
          .map((s) => (
            <option key={s} value={s}>
              {every(s)}
            </option>
          ))}
      </select>
    </div>
  );
}

function SupabaseForm({ projectId, minInterval, prefill }: FormProps) {
  return (
    <form action={addTarget} className="max-w-2xl space-y-4">
      <Hidden projectId={projectId} kind="supabase" />
      <p className="text-sm text-muted">
        Supabase pauses a free project after 7 days without database activity. Run this once in your
        project&apos;s SQL editor. It adds a function that returns 1 and exposes nothing else, and
        every ping runs it inside Postgres.
      </p>
      <pre className="overflow-x-auto rounded-xl border border-line bg-sky p-4 font-mono text-[13px] leading-relaxed text-text/90 select-all">
        {KEEPALIVE_SQL}
      </pre>
      <Field
        id="project_url"
        defaultValue={prefill.project_url}
        label="Project URL"
        placeholder="https://abcdefghijklmnopqrst.supabase.co"
      />
      <Field
        id="anon_key"
        label="Anon key (never the service-role key)"
        placeholder="eyJhbGciOi… or sb_publishable_…"
      />
      <div>
        <label className={LABEL} htmlFor="table">
          or read a table instead — optional
        </label>
        <input
          id="table"
          name="table"
          autoComplete="off"
          placeholder="leave empty to use keepalive()"
          className={FIELD}
        />
      </div>
      <IntervalField id="supabase_interval" min={minInterval} />
      <button type="submit" className={BUTTON}>
        Add Supabase target
      </button>
    </form>
  );
}

function RenderForm({ projectId, prefill }: FormProps) {
  return (
    <form action={addTarget} className="max-w-2xl space-y-4">
      <Hidden projectId={projectId} kind="render" />
      <p className="text-sm text-muted">
        A free service spins down after 15 minutes without traffic, so we ping every 10 minutes.
      </p>
      <p className="border border-warn/40 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-warn">
        One service kept awake uses about 744 of your workspace&apos;s 750 free hours a month. Keep
        a second one awake in the same workspace and Render suspends all your free services
        mid-month.
      </p>
      <Field
        id="render_url"
        defaultValue={prefill.url}
        name="url"
        type="url"
        label="Service URL"
        placeholder="https://my-api.onrender.com/health"
      />
      <label className="flex items-start gap-3 text-sm leading-relaxed text-muted">
        <input type="checkbox" name="separate_workspace" className="mt-1 size-4 accent-alive" />
        <span>
          This service is in a different Render workspace from any other service I keep awake here.
          Only needed if you already have one.
        </span>
      </label>
      <button type="submit" className={BUTTON}>
        Add Render target
      </button>
    </form>
  );
}

function HuggingFaceForm({ projectId, prefill }: FormProps) {
  return (
    <form action={addTarget} className="max-w-2xl space-y-4">
      <Hidden projectId={projectId} kind="huggingface" />
      <p className="text-sm text-muted">
        A visit wakes a sleeping Space and resets its timer. We read the Space&apos;s own sleep
        timeout and ping at half of it, so a single missed ping never lets it sleep.
      </p>
      <Field
        id="space"
        defaultValue={prefill.space}
        label="Space name or URL"
        placeholder="owner/space-name"
      />
      <button type="submit" className={BUTTON}>
        Add Space
      </button>
    </form>
  );
}

function AppwriteForm({ projectId, prefill }: FormProps) {
  return (
    <form action={addTarget} className="max-w-2xl space-y-4">
      <Hidden projectId={projectId} kind="appwrite" />
      <p className="text-sm text-muted">
        Appwrite pauses a free project after 7 days without development activity, and reads do not
        count. So we write: one row, always the same row, holding a timestamp. Set it up once:
      </p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Databases → open your existing database. The free plan allows one, so the table goes
          there.
        </li>
        <li>
          Create a table named <span className="font-mono text-text">{APPWRITE_TABLE_NAME}</span>{" "}
          with a string column <span className="font-mono text-text">{APPWRITE_COLUMN}</span> of
          size 40, then copy its Table ID (the code next to its name). We only ever write one row to
          it.
        </li>
        <li>
          Overview → API keys → create a key with{" "}
          <em className="text-text not-italic font-semibold">only</em> the{" "}
          <span className="font-mono text-text">rows.write</span> scope. It cannot read your data or
          change your schema.
        </li>
        <li>Paste the endpoint, project id, database id, table id and key below.</li>
      </ol>
      <p className="border border-warn/40 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-warn">
        Appwrite says only Console activity keeps a project awake. Whether a write counts is not yet
        proven. Every write is logged here, so you will see it the day one fails.
      </p>
      <Field
        id="endpoint"
        defaultValue={prefill.endpoint}
        label="API endpoint"
        placeholder="https://fra.cloud.appwrite.io/v1"
      />
      <Field
        id="appwrite_project"
        defaultValue={prefill.appwrite_project}
        label="Project ID"
        placeholder="6523f1a2b3c4d5e6f7a8"
      />
      <Field
        id="appwrite_database"
        label="Database ID"
        placeholder="the id shown on your database's page"
      />
      <Field id="appwrite_table" label="Table ID" placeholder="e.g. 6ab8dfa1000b5b01b1b1" />
      <Field
        id="appwrite_key"
        label="API key with only the rows.write scope"
        placeholder="standard_…"
      />
      <button type="submit" className={BUTTON}>
        Add Appwrite target
      </button>
    </form>
  );
}

function CustomForm({ projectId, minInterval, heartbeatTypes }: FormProps) {
  return (
    <form action={addTarget} className="max-w-2xl space-y-4">
      <Hidden projectId={projectId} kind="custom" />
      <p className="text-sm text-muted">
        Point us at a route in your app and we give you a few lines to add, so every check runs a
        real query. Or we can simply visit a URL, which only proves it answers.
      </p>
      <Field
        id="custom_url"
        name="url"
        type="url"
        label="URL"
        placeholder="https://my-app.example.com/api/keepalive"
      />
      <div>
        <label className={LABEL} htmlFor="heartbeat_type">
          What should the check do?
        </label>
        <select id="heartbeat_type" name="heartbeat_type" className={FIELD} defaultValue="db_query">
          {heartbeatTypes.map((h) => (
            <option key={h} value={h}>
              {HEARTBEAT_CHOICE[h] ?? h}
            </option>
          ))}
        </select>
      </div>
      <IntervalField id="custom_interval" min={minInterval} />
      <button type="submit" className={BUTTON}>
        Add backend
      </button>
    </form>
  );
}

const HEARTBEAT_CHOICE: Record<string, string> = {
  db_query: "Call my keepalive route, which runs a real query",
  plain: "Just visit the URL",
};

/** Values found by the repository scan, keyed by form field name. */
export type Prefill = Record<string, string | undefined>;

type FormProps = {
  projectId: string;
  minInterval: number;
  heartbeatTypes: string[];
  prefill: Prefill;
};

/** The choices, in the order people most often need them. */
export const PLATFORMS = [
  {
    kind: "supabase",
    name: "Supabase",
    blurb: "Pauses after 7 days without database activity.",
    Form: SupabaseForm,
  },
  {
    kind: "render",
    name: "Render",
    blurb: "Free services spin down after 15 minutes idle.",
    Form: RenderForm,
  },
  {
    kind: "huggingface",
    name: "Hugging Face Space",
    blurb: "Spaces sleep after their own timeout.",
    Form: HuggingFaceForm,
  },
  {
    kind: "appwrite",
    name: "Appwrite Cloud",
    blurb: "Pauses after 7 days; needs one small table.",
    Form: AppwriteForm,
  },
  {
    kind: "custom",
    name: "Something else",
    blurb: "Any URL, or a route in your own app.",
    Form: CustomForm,
  },
] as const;

/** Step one is choosing a platform; step two shows only that platform's form. */
export function AddTarget({ kind, ...props }: FormProps & { kind: string | undefined }) {
  const supabaseConnect = Boolean(
    process.env.SUPABASE_OAUTH_CLIENT_ID && process.env.SUPABASE_OAUTH_CLIENT_SECRET,
  );
  const chosen = PLATFORMS.find((p) => p.kind === kind);
  if (!chosen) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {PLATFORMS.map((p) => (
          <Link
            key={p.kind}
            href={`?add=${p.kind}#add`}
            scroll={false}
            className="group flex gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-alive/60"
          >
            <span
              aria-hidden
              className="window-dim mt-1 h-5 w-3.5 shrink-0 rounded-[3px] group-hover:window-lit"
            />
            <span>
              <span className="block text-[15px] font-semibold group-hover:text-alive">
                {p.name}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{p.blurb}</span>
            </span>
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h3 className="text-lg font-semibold">Keep a {chosen.name} backend awake</h3>
        <Link
          href="?#add"
          scroll={false}
          className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-text"
        >
          Choose a different platform
        </Link>
      </div>
      {chosen.kind === "supabase" && supabaseConnect && (
        <div className="mb-8 rounded-xl border border-alive/40 bg-alive/5 p-5">
          <p className="text-[15px] font-semibold">Let us do it for you</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Connect your Supabase account once and pick a project. We install keepalive() and add
            the key ourselves, then let go of the access.
          </p>
          <a
            href={`/connect/supabase/start?project=${props.projectId}`}
            className="mt-4 inline-block rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink hover:bg-warn"
          >
            Connect Supabase
          </a>
          <p className="mt-4 text-sm text-muted">Or set it up by hand:</p>
        </div>
      )}
      <chosen.Form key={JSON.stringify(props.prefill)} {...props} />
    </div>
  );
}
