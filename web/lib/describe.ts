/** Plain-language names and sentences for targets, so no screen shows raw URLs or jargon. */
import { ago } from "./format.ts";
import { bufferText, type Health, type State, stateOf } from "./health.ts";

export type Describable = { url: string; platform: string; heartbeat_type: string };

export const PLATFORM_NAMES: Record<string, string> = {
  supabase: "Supabase",
  render: "Render",
  huggingface: "Hugging Face",
  appwrite: "Appwrite",
  railway: "Railway",
  mongodb: "MongoDB Atlas",
  koyeb: "Koyeb",
  custom: "Website",
};

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** What the check actually does, in words a first-time user can follow. */
export function methodText(t: Describable): string {
  const path = (() => {
    try {
      return new URL(t.url).pathname;
    } catch {
      return "";
    }
  })();
  if (t.platform === "supabase") {
    if (path.endsWith("/rpc/keepalive")) return "calls keepalive() in your database";
    return `reads one row from ${path.split("/").pop()}`;
  }
  if (t.platform === "appwrite") return "writes one heartbeat row";
  if (t.platform === "mongodb") return "connects to your cluster and pings it";
  if (t.heartbeat_type === "db_query") return "calls your keepalive route";
  return "visits the page";
}

/** A short title and a secondary line: the platform, then which instance of it. */
export function targetTitle(t: Describable): { title: string; detail: string } {
  const h = host(t.url);
  if (t.platform === "supabase") return { title: "Supabase database", detail: h.split(".")[0] };
  if (t.platform === "huggingface")
    return { title: "Hugging Face Space", detail: h.replace(/\.hf\.space$/, "") };
  if (t.platform === "render") return { title: "Render service", detail: h };
  if (t.platform === "appwrite") return { title: "Appwrite project", detail: h.split(".")[0] };
  if (t.platform === "mongodb") return { title: "MongoDB Atlas cluster", detail: h.split(".")[0] };
  if (t.platform === "koyeb") return { title: "Koyeb service", detail: h };
  return { title: t.heartbeat_type === "db_query" ? "App backend" : "Website", detail: h };
}

/**
 * A page visit keeps a site's server warm but never reaches a separate database, which is
 * the misunderstanding most keep-alive setups fail on, so it is said out loud.
 */
export function caveat(t: Describable): string | null {
  return t.platform === "custom" && t.heartbeat_type === "plain"
    ? "Only checks the site is up. It does not keep a separate database awake."
    : null;
}

export type Status = { state: State; headline: string; sentence: string };

export function statusOf(t: Describable, h: Health | undefined, now = Date.now()): Status {
  const state = stateOf(h, now);
  const platform = PLATFORM_NAMES[t.platform] ?? t.platform;
  const checked = h?.last_ping_at ? `Checked ${ago(h.last_ping_at, now)}.` : "";
  const buffer = bufferText(h, now);
  switch (state) {
    case "idle":
      return {
        state,
        headline: "Waiting",
        sentence: "Waiting for the first check, within a minute.",
      };
    case "failing":
      return {
        state,
        headline: "Failing",
        sentence: `${h?.failures_since_ok} checks failed in a row.${h?.last_ok_at ? ` Last success ${ago(h.last_ok_at, now)}.` : ""}`,
      };
    case "pause_soon":
      return {
        state,
        headline: "Pausing soon",
        sentence: `${checked} ${platform} could pause it in ${buffer?.replace(" before pause", "")}.`,
      };
    case "paused":
      return {
        state,
        headline: "Probably paused",
        sentence: `No success within ${platform}'s pause window. Restore it in ${platform}; checks cannot wake it.`,
      };
    default:
      return {
        state,
        headline: h?.pause_at ? "Awake" : "Up",
        sentence: buffer
          ? `${checked} ${platform} would pause it in ${buffer.replace(" before pause", "")} if checks stopped.`
          : checked,
      };
  }
}
