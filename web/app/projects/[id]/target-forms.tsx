/** The add-target forms, one per platform, each asking only for what that platform needs. */
import { addTarget } from "@/app/projects/actions";
import { APPWRITE_COLUMN, APPWRITE_TABLE_NAME } from "@/lib/appwrite";
import { every } from "@/lib/format";
import { KEEPALIVE_SQL } from "@/lib/target-url";

const FIELD =
  "w-full border border-line bg-ink px-3 py-2 font-mono text-sm placeholder:text-muted/60";
const BUTTON = "border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-raised";
const LABEL = "mb-1.5 block font-mono text-xs text-muted";
const HEADING = "font-mono text-xs tracking-wide text-muted uppercase";

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

export function TargetForms({
  projectId,
  minInterval,
  heartbeatTypes,
}: {
  projectId: string;
  minInterval: number;
  heartbeatTypes: string[];
}) {
  return (
    <section className="mt-14 grid gap-x-12 gap-y-14 lg:grid-cols-2">
      <form action={addTarget} className="space-y-4">
        <Hidden projectId={projectId} kind="supabase" />
        <h2 className={HEADING}>Supabase</h2>
        <p className="text-sm text-muted">
          Supabase pauses a free project after 7 days without database activity. Run this once in
          your project&apos;s SQL editor. It adds a function that returns 1 and exposes nothing
          else, and every ping runs it inside Postgres.
        </p>
        <pre className="overflow-x-auto border border-line bg-ink p-3 font-mono text-xs leading-relaxed select-all">
          {KEEPALIVE_SQL}
        </pre>
        <Field
          id="project_url"
          label="project url"
          placeholder="https://abcdefghijklmnopqrst.supabase.co"
        />
        <Field
          id="anon_key"
          label="anon key — never the service-role key"
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

      <form action={addTarget} className="space-y-4">
        <Hidden projectId={projectId} kind="render" />
        <h2 className={HEADING}>Render web service</h2>
        <p className="text-sm text-muted">
          A free service spins down after 15 minutes without traffic, so we ping every 10 minutes.
        </p>
        <p className="border border-warn/40 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-warn">
          One service kept awake uses about 744 of your workspace&apos;s 750 free hours a month.
          Keep a second one awake in the same workspace and Render suspends all your free services
          mid-month.
        </p>
        <Field
          id="render_url"
          name="url"
          type="url"
          label="service url"
          placeholder="https://my-api.onrender.com/health"
        />
        <button type="submit" className={BUTTON}>
          Add Render target
        </button>
      </form>

      <form action={addTarget} className="space-y-4">
        <Hidden projectId={projectId} kind="huggingface" />
        <h2 className={HEADING}>Hugging Face Space</h2>
        <p className="text-sm text-muted">
          A visit wakes a sleeping Space and resets its timer. We read the Space&apos;s own sleep
          timeout and ping at half of it, so a single missed ping never lets it sleep.
        </p>
        <Field id="space" label="space id or url" placeholder="owner/space-name" />
        <button type="submit" className={BUTTON}>
          Add Space
        </button>
      </form>

      <form action={addTarget} className="space-y-4">
        <Hidden projectId={projectId} kind="appwrite" />
        <h2 className={HEADING}>Appwrite Cloud</h2>
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
            size 40, then copy its Table ID (the code next to its name). We only ever write one row
            to it.
          </li>
          <li>
            Overview → API keys → create a key with{" "}
            <span className="font-mono text-text">only</span> the{" "}
            <span className="font-mono text-text">rows.write</span> scope. It cannot read your data
            or change your schema.
          </li>
          <li>Paste the endpoint, project id, database id, table id and key below.</li>
        </ol>
        <p className="border border-warn/40 bg-warn/5 px-3 py-2 text-xs leading-relaxed text-warn">
          Appwrite says only Console activity keeps a project awake. Whether a write counts is not
          yet proven. Every write is logged here, so you will see it the day one fails.
        </p>
        <Field id="endpoint" label="api endpoint" placeholder="https://fra.cloud.appwrite.io/v1" />
        <Field id="appwrite_project" label="project id" placeholder="6523f1a2b3c4d5e6f7a8" />
        <Field
          id="appwrite_database"
          label="database id"
          placeholder="the id shown on your database's page"
        />
        <Field id="appwrite_table" label="table id" placeholder="e.g. 6ab8dfa1000b5b01b1b1" />
        <Field id="appwrite_key" label="api key — rows.write scope only" placeholder="standard_…" />
        <button type="submit" className={BUTTON}>
          Add Appwrite target
        </button>
      </form>

      <form action={addTarget} className="space-y-4">
        <Hidden projectId={projectId} kind="custom" />
        <h2 className={HEADING}>Any other backend</h2>
        <p className="text-sm text-muted">
          Choose <span className="font-mono">db_query</span> and we give you a small route to add to
          your app, so every ping runs a real query. <span className="font-mono">plain</span> only
          proves the URL answers.
        </p>
        <Field
          id="custom_url"
          name="url"
          type="url"
          label="url"
          placeholder="https://my-app.example.com/api/keepalive"
        />
        <div>
          <label className={LABEL} htmlFor="heartbeat_type">
            heartbeat
          </label>
          <select
            id="heartbeat_type"
            name="heartbeat_type"
            className={FIELD}
            defaultValue="db_query"
          >
            {heartbeatTypes.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <IntervalField id="custom_interval" min={minInterval} />
        <button type="submit" className={BUTTON}>
          Add target
        </button>
      </form>
    </section>
  );
}
