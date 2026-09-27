/**
 * One check run at the moment a target is saved, so a broken setup is caught with a reason
 * instead of surfacing as a failed check a minute later.
 *
 * It builds the same request the engine sends. On failure it reads the platform's error
 * body, which is an error message and never the user's data, to say what to fix.
 */
import { atlasPing, diagnoseAtlas } from "./mongodb.ts";

export type Probeable = {
  platform: string;
  url: string;
  heartbeat_type: string;
  method: string;
  secret: string | null;
  platform_ref: string | null;
};

export type ProbeResult = {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  diagnosis: string | null;
  restoreUrl: string | null;
};

const TIMEOUT_MS = 25_000;
const ERROR_BODY_LIMIT = 4_000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Where the owner restores a paused project, or null where there is no such page. */
export function restoreUrl(t: Probeable): string | null {
  if (t.platform === "supabase")
    return `https://supabase.com/dashboard/project/${hostOf(t.url).split(".")[0]}`;
  if (t.platform === "appwrite" && t.platform_ref)
    return `https://appwrite.io/projects/${t.platform_ref}`;
  return null;
}

function requestFor(t: Probeable): RequestInit {
  if (t.heartbeat_type === "db_write") {
    return {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-appwrite-project": t.platform_ref ?? "",
        "x-appwrite-key": t.secret ?? "",
      },
      body: JSON.stringify({ data: { beat: new Date().toISOString() } }),
    };
  }
  const headers = new Headers();
  if (t.secret) {
    headers.set("authorization", `Bearer ${t.secret}`);
    if (t.platform === "supabase") headers.set("apikey", t.secret);
  }
  if (t.heartbeat_type === "db_query") headers.set("x-sleeve-mode", "db_query");
  return { method: t.method, headers };
}

type ErrorBody = { code?: string; type?: string; message?: string };

/** Turns a failed response into the one thing the user should change. */
export function diagnose(t: Probeable, status: number, body: ErrorBody): string | null {
  if (t.platform === "supabase") {
    if (status === 540 || status === 503)
      return "This Supabase project looks paused. Restore it first; a check cannot wake it.";
    if (body.code === "PGRST202")
      return "keepalive() is not installed yet, or PostgREST has not noticed it. Run the SQL above, including the last notify line.";
    if (body.code === "42501")
      return "The anon role cannot read that table. Leave the table empty to use keepalive() instead.";
    if (body.code === "PGRST205")
      return "That table does not exist. Check the name, or leave it empty to use keepalive().";
    if (status === 401)
      return "Supabase rejected the key. Paste the project's anon or publishable key.";
  }
  if (t.platform === "appwrite") {
    if (body.type === "project_not_found")
      return "Appwrite does not know that project ID. Copy it from the project's settings.";
    if (body.type === "database_not_found")
      return "Appwrite has no database with that ID. Copy it from the database's page.";
    if (body.type === "table_not_found")
      return "Appwrite has no table with that Table ID. Copy the ID shown next to the table's name, not the name itself.";
    if (body.type?.includes("column") || body.type === "row_invalid_structure")
      return "The table needs a string column called beat, of size 40.";
    if (status === 401) return "Appwrite rejected the key. Create one with the rows.write scope.";
    if (status === 402 || body.type?.includes("paused"))
      return "This Appwrite project looks paused. Restore it in the console first.";
  }
  if (status === 404) return "Nothing answered at that URL (404). Check the address.";
  if (status >= 500)
    return `The service answered with an error (${status}). If it is still starting up, try again in a minute.`;
  if (status === 401 || status === 403)
    return `The service refused the check (${status}). Check the secret or key.`;
  return `The check got a ${status} response.`;
}

export async function probeTarget(
  t: Probeable,
  fetchFn: typeof fetch = fetch,
  dbPing: (uri: string, timeoutMs: number) => Promise<void> = atlasPing,
): Promise<ProbeResult> {
  if (t.heartbeat_type === "db_connect") return probeConnection(t, dbPing);
  const restore = restoreUrl(t);
  const started = performance.now();
  let res: Response;
  try {
    res = await fetchFn(t.url, {
      ...requestFor(t),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const reason =
      e instanceof DOMException && e.name === "TimeoutError"
        ? "it did not answer within 25 seconds"
        : "the address did not respond";
    return {
      ok: false,
      status: null,
      latencyMs: null,
      diagnosis: `Could not reach it: ${reason}.`,
      restoreUrl: null,
    };
  }
  const latencyMs = Math.round(performance.now() - started);
  if (res.status >= 200 && res.status < 400) {
    await res.body?.cancel().catch(() => {});
    return { ok: true, status: res.status, latencyMs, diagnosis: null, restoreUrl: null };
  }
  const text = (await res.text().catch(() => "")).slice(0, ERROR_BODY_LIMIT);
  let body: ErrorBody = {};
  try {
    body = JSON.parse(text) as ErrorBody;
  } catch {
    body = {};
  }
  const diagnosis = diagnose(t, res.status, body);
  const paused = diagnosis?.includes("paused") ?? false;
  return {
    ok: false,
    status: res.status,
    latencyMs,
    diagnosis,
    restoreUrl: paused ? restore : null,
  };
}

/** Atlas has no HTTP check: the probe connects exactly as the engine will. */
async function probeConnection(
  t: Probeable,
  dbPing: (uri: string, timeoutMs: number) => Promise<void>,
): Promise<ProbeResult> {
  const started = performance.now();
  try {
    await dbPing(t.secret ?? "", TIMEOUT_MS);
    return {
      ok: true,
      status: null,
      latencyMs: Math.round(performance.now() - started),
      diagnosis: null,
      restoreUrl: null,
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      latencyMs: null,
      diagnosis: diagnoseAtlas(e instanceof Error ? e.message : String(e)),
      restoreUrl: null,
    };
  }
}

/** Only links to the platforms' own dashboards are ever rendered from a query string. */
export function isRestoreLink(url: string | undefined): url is string {
  return (
    !!url &&
    /^https:\/\/(supabase\.com\/dashboard\/project|appwrite\.io\/projects)\/[A-Za-z0-9._-]+$/.test(
      url,
    )
  );
}
