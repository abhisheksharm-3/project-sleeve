/** The add-target forms, one per platform, each asking only for what that platform needs. */
import Link from "next/link";
import { addTarget } from "@/app/projects/actions";
import { APPWRITE_COLUMN, APPWRITE_TABLE_NAME } from "@/lib/appwrite";
import { every } from "@/lib/format";
import { HEARTBEAT_PERIODS } from "@/lib/heartbeat";
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
        How often
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

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-x-4 gap-y-3 sm:grid-cols-[1.75rem_minmax(0,1fr)]">
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full border border-line text-sm text-muted tabular-nums"
      >
        {n}
      </span>
      <div className="min-w-0 space-y-3">
        <h4 className="pt-0.5 text-[15px] font-semibold">{title}</h4>
        {children}
      </div>
    </li>
  );
}

function SupabaseForm({ projectId, minInterval, prefill }: FormProps) {
  return (
    <form action={addTarget}>
      <Hidden projectId={projectId} kind="supabase" />
      <ol className="space-y-8">
        <Step n={1} title="Add the keepalive function">
          <p className="text-sm leading-relaxed text-muted">
            Run this once in your project&apos;s SQL editor. It adds a function that returns 1 and
            exposes nothing else; every check runs it inside Postgres, which is what Supabase counts
            as activity.
          </p>
          <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-[13px] leading-relaxed text-text/90 select-all">
            {KEEPALIVE_SQL}
          </pre>
        </Step>
        <Step n={2} title="Say which project">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="project_url"
              defaultValue={prefill.project_url}
              label="Project URL"
              placeholder="https://abcdefghijklmnopqrst.supabase.co"
            />
            <Field
              id="anon_key"
              label="Anon or publishable key"
              placeholder="eyJhbGciOi… or sb_publishable_…"
            />
          </div>
          <p className="text-sm text-muted">
            Never the service-role key; we refuse it. Both are under Project Settings, API.
          </p>
        </Step>
        <Step n={3} title="Choose how often">
          <div className="grid gap-4 md:grid-cols-2">
            <IntervalField id="supabase_interval" min={minInterval} />
            <div>
              <label className={LABEL} htmlFor="table">
                Table to read instead, optional
              </label>
              <input
                id="table"
                name="table"
                autoComplete="off"
                placeholder="Leave empty to use keepalive()"
                className={FIELD}
              />
            </div>
          </div>
        </Step>
      </ol>
      <div className="mt-8 sm:pl-11">
        <button type="submit" className={BUTTON}>
          Keep it awake
        </button>
      </div>
    </form>
  );
}

function AtlasForm({ projectId, prefill }: FormProps) {
  return (
    <form action={addTarget}>
      <Hidden projectId={projectId} kind="mongodb" />
      <ol className="space-y-8">
        <Step n={1} title="Make a database user for us">
          <p className="text-sm leading-relaxed text-muted">
            Atlas pauses a free cluster after 30 days without a connection, so every check opens one
            and sends ping. In Database Access, add a user with a password and the built-in role{" "}
            <span className="font-medium text-text">read</span> on a database called{" "}
            <span className="font-mono text-[13px] text-text">sleeve</span>. It can see nothing
            else.
          </p>
        </Step>
        <Step n={2} title="Let our checks reach the cluster">
          <p className="text-sm leading-relaxed text-muted">
            In Network Access, allow connections from anywhere (0.0.0.0/0). Our checks do not come
            from a fixed address, and the user from step 1 is what keeps the cluster safe.
          </p>
        </Step>
        <Step n={3} title="Paste the connection string">
          <Field
            id="connection_string"
            defaultValue={prefill.connection_string}
            label="Connection string"
            placeholder="mongodb+srv://sleeve:<password>@cluster0.abcde.mongodb.net/"
          />
          <p className="text-sm text-muted">
            From Connect, Drivers, with the password filled in. Only you and our checker can read
            it, and every screen shows just the cluster&apos;s name.
          </p>
        </Step>
      </ol>
      <div className="mt-8 sm:pl-11">
        <button type="submit" className={BUTTON}>
          Keep it awake
        </button>
      </div>
    </form>
  );
}

function HeartbeatForm({ projectId }: FormProps) {
  return (
    <form action={addTarget} className="max-w-2xl space-y-4">
      <Hidden projectId={projectId} kind="heartbeat" />
      <p className="text-sm text-muted">
        For a cron job, a backup script or a queue worker: it pings a URL we give you each time it
        runs, and you hear from us when a ping does not arrive on time.
      </p>
      <Field id="label" label="Name" placeholder="Nightly backup" maxLength={80} />
      <div>
        <label className={LABEL} htmlFor="period">
          It runs
        </label>
        <select id="period" name="period" className={FIELD} defaultValue="86400">
          {HEARTBEAT_PERIODS.map((p) => (
            <option key={p.seconds} value={p.seconds}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={BUTTON}>
        Create heartbeat
      </button>
    </form>
  );
}

function KoyebForm({ projectId, prefill }: FormProps) {
  return (
    <form action={addTarget} className="max-w-2xl space-y-4">
      <Hidden projectId={projectId} kind="koyeb" />
      <p className="text-sm text-muted">
        Koyeb&apos;s free instance sleeps after an hour without traffic, so we visit it every 30
        minutes.
      </p>
      <Field
        id="koyeb_url"
        defaultValue={prefill.url}
        name="url"
        type="url"
        label="Service URL"
        placeholder="https://my-app-myorg.koyeb.app/health"
      />
      <button type="submit" className={BUTTON}>
        Keep it awake
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
    kind: "mongodb",
    name: "MongoDB Atlas",
    blurb: "Free clusters pause after 30 days without a connection.",
    Form: AtlasForm,
  },
  {
    kind: "koyeb",
    name: "Koyeb",
    blurb: "The free instance sleeps after an hour idle.",
    Form: KoyebForm,
  },
  {
    kind: "heartbeat",
    name: "Scheduled job",
    blurb: "Your cron or script pings us; we tell you when it goes quiet.",
    Form: HeartbeatForm,
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
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORMS.map((p) => (
          <Link
            key={p.kind}
            href={`?add=${p.kind}#add`}
            scroll={false}
            className="group flex gap-3 bg-ink p-5 transition-colors hover:bg-surface"
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
  const connect = chosen.kind === "supabase" && supabaseConnect;
  return (
    <div className="rounded-2xl border border-line p-6 sm:p-8">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h3 className="text-lg font-semibold">Keep a {chosen.name} backend awake</h3>
        <Link
          href="?#add"
          scroll={false}
          className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-text"
        >
          Choose a different platform
        </Link>
      </div>
      <div
        className={
          connect ? "grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14" : "max-w-3xl"
        }
      >
        {connect && (
          <aside className="lg:border-r lg:border-line lg:pr-14">
            <h4 className="text-[15px] font-semibold">The quick way</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Connect your Supabase account and pick a project. We install keepalive() and add the
              key ourselves, then let go of the access. It takes about ten seconds.
            </p>
            <a
              href={`/connect/supabase/start?project=${props.projectId}`}
              className={`mt-5 inline-block ${BUTTON}`}
            >
              Connect Supabase
            </a>
            <p className="mt-8 text-sm text-muted lg:hidden">Or do it by hand:</p>
          </aside>
        )}
        <div className="min-w-0">
          {connect && <h4 className="mb-6 text-[15px] font-semibold max-lg:hidden">By hand</h4>}
          <chosen.Form key={JSON.stringify(props.prefill)} {...props} />
        </div>
      </div>
    </div>
  );
}
