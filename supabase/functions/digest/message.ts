/** The Monday digest for one user, as webhook text. Pure: no clock or network of its own. */

export type DigestBackend = {
  project: string;
  platform: string;
  pings7: number;
  ok7: number;
  failuresSinceOk: number;
  pauseAt: string | null;
  pauseWindowSeconds: number | null;
};

export type DigestWorkflow = {
  project: string;
  name: string;
  state: string;
  lastRunAt: string | null;
};

const KIND: Record<string, string> = {
  supabase: "Supabase database",
  render: "Render service",
  huggingface: "Hugging Face Space",
  appwrite: "Appwrite project",
  custom: "Website",
};
const DAY_S = 86_400;
const FAILING_STREAK = 3;

function repo(name: string): string {
  return name.split("/").pop() ?? name;
}

function span(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
}

function label(b: DigestBackend): string {
  return `${repo(b.project)} ${KIND[b.platform] ?? "backend"}`;
}

/** Null when there is nothing to report: no backends and no stopped workflows. */
export function composeDigest(
  backends: DigestBackend[],
  workflows: DigestWorkflow[],
  siteUrl: string,
  now: number,
): string | null {
  const stopped = workflows.filter((w) => w.state !== "active");
  if (backends.length === 0 && stopped.length === 0) return null;

  const pings = backends.reduce((n, b) => n + b.pings7, 0);
  const ok = backends.reduce((n, b) => n + b.ok7, 0);
  const rate = pings
    ? `${Math.round((ok / pings) * 1000) / 10}% of checks passed`
    : "no checks ran";
  const lines = [
    `**Your week on ProjectSleeve: ${backends.length} ${
      backends.length === 1 ? "backend" : "backends"
    }, ${rate}**`,
  ];

  const paused = backends.filter((b) => b.pauseAt && Date.parse(b.pauseAt) <= now);
  const failing = backends.filter(
    (b) => !paused.includes(b) && b.failuresSinceOk >= FAILING_STREAK,
  );
  if (paused.length || failing.length) {
    lines.push("", "Needs you:");
    for (const b of paused) {
      lines.push(`- ${label(b)} has probably paused. Restore it on ${b.platform}.`);
    }
    for (const b of failing) {
      lines.push(`- ${label(b)}: ${b.failuresSinceOk} checks in a row have failed.`);
    }
  }

  const nearest = backends
    .filter(
      (b) => (b.pauseWindowSeconds ?? 0) >= DAY_S && b.pauseAt && Date.parse(b.pauseAt) > now,
    )
    .sort((a, b) => Date.parse(a.pauseAt ?? "") - Date.parse(b.pauseAt ?? ""))[0];
  if (nearest?.pauseAt) {
    lines.push(
      "",
      `Closest to pausing: ${label(nearest)}, ${
        span(Date.parse(nearest.pauseAt) - now)
      } to spare if checks stopped.`,
    );
  }

  if (stopped.length) {
    lines.push("", "Keep-alive workflows GitHub has switched off:");
    for (const w of stopped) {
      lines.push(
        `- ${repo(w.project)}: "${w.name}"${
          w.lastRunAt ? `, last ran ${new Date(w.lastRunAt).toDateString()}` : ""
        }`,
      );
    }
  }

  lines.push("", `Dashboard: ${siteUrl}/dashboard`);
  return lines.join("\n");
}
