/** Reads a repository's config files and workflows from GitHub and reports findings. */
import { extractFindings, type Findings, looksLikeKeepAlive } from "./repo-findings.ts";

export type KeepAliveWorkflow = {
  name: string;
  path: string;
  state: string;
  lastRunAt: string | null;
  lastConclusion: string | null;
};

export type RepoScan = Findings & { workflows: KeepAliveWorkflow[] };

const FILES = [
  ".env.example",
  ".env.sample",
  ".env.local.example",
  ".env.template",
  "README.md",
  "render.yaml",
];

type Gh = (path: string, raw?: boolean) => Promise<Response>;

function client(token: string, fetchFn: typeof fetch): Gh {
  return (path, raw = false) =>
    fetchFn(`https://api.github.com${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      cache: "no-store",
    });
}

async function text(gh: Gh, path: string): Promise<string | null> {
  const res = await gh(path, true);
  return res.ok ? res.text() : null;
}

async function keepAliveWorkflows(gh: Gh, repo: string): Promise<KeepAliveWorkflow[]> {
  const dir = await gh(`/repos/${repo}/contents/.github/workflows`);
  if (!dir.ok) return [];
  const entries = ((await dir.json()) as { name: string; path: string }[]).filter((e) =>
    /\.ya?ml$/.test(e.name),
  );
  const bodies = await Promise.all(
    entries.map((e) => text(gh, `/repos/${repo}/contents/${e.path}`)),
  );
  const pings = entries.filter((_, i) => looksLikeKeepAlive(bodies[i] ?? ""));
  if (pings.length === 0) return [];

  const listing = await gh(`/repos/${repo}/actions/workflows`);
  const known = listing.ok
    ? (
        (await listing.json()) as {
          workflows: { id: number; name: string; path: string; state: string }[];
        }
      ).workflows
    : [];
  return Promise.all(
    pings.map(async (e) => {
      const wf = known.find((w) => w.path === e.path);
      if (!wf)
        return {
          name: e.name,
          path: e.path,
          state: "unknown",
          lastRunAt: null,
          lastConclusion: null,
        };
      const runs = await gh(`/repos/${repo}/actions/workflows/${wf.id}/runs?per_page=1`);
      const last = runs.ok
        ? (
            (await runs.json()) as {
              workflow_runs: { created_at: string; conclusion: string | null }[];
            }
          ).workflow_runs[0]
        : undefined;
      return {
        name: wf.name,
        path: e.path,
        state: wf.state,
        lastRunAt: last?.created_at ?? null,
        lastConclusion: last?.conclusion ?? null,
      };
    }),
  );
}

/** About a dozen GitHub requests per repository; every miss is an absence, never an error. */
export async function scanRepo(
  repo: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<RepoScan> {
  const gh = client(token, fetchFn);
  const [contents, workflows] = await Promise.all([
    Promise.all(
      FILES.map(async (f) => [f, await text(gh, `/repos/${repo}/contents/${f}`)] as const),
    ),
    keepAliveWorkflows(gh, repo),
  ]);
  const files = Object.fromEntries(
    contents.filter((c): c is readonly [string, string] => c[1] !== null),
  );
  return { ...extractFindings(files), workflows };
}
