/** Pure parsing of a repository's files into the backends it uses and its keep-alive jobs. */

export type Findings = {
  supabase: { url: string; source: string }[];
  appwrite: { endpoint: string; projectId: string | null; source: string }[];
  render: { url: string; source: string }[];
  huggingface: { id: string; source: string }[];
  /** Absent from scans saved before Atlas and Koyeb were supported. */
  mongodb?: { host: string; source: string }[];
  koyeb?: { url: string; source: string }[];
};

const SUPABASE = /https:\/\/([a-z0-9]{20})\.supabase\.co/g;
const APPWRITE_ENDPOINT = /https:\/\/(?:[a-z0-9-]+\.)?cloud\.appwrite\.io\/v1/;
const APPWRITE_PROJECT = /APPWRITE_PROJECT(?:_ID)?\s*[=:]\s*["']?([A-Za-z0-9][A-Za-z0-9._-]{9,35})/;
/** Only the cluster host is kept; any credentials in the string are dropped here. */
const ATLAS = /mongodb\+srv:\/\/(?:[^@\s"'/]+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.mongodb\.net)/gi;
const KOYEB = /https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.koyeb\.app)/g;
const HF_SPACE = /https:\/\/huggingface\.co\/spaces\/([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)/g;

/** A real project ref, not a documentation placeholder like xxxxxxxxxxxxxxxxxxxx. */
function isRealRef(ref: string): boolean {
  return new Set(ref).size > 4;
}

function renderServices(yaml: string): string[] {
  const names: string[] = [];
  let inServices = false;
  let type: string | null = null;
  for (const line of yaml.split("\n")) {
    if (/^\S/.test(line)) inServices = line.startsWith("services:");
    if (!inServices) continue;
    const t = /^\s*-\s*type:\s*(\S+)/.exec(line) ?? /^\s+type:\s*(\S+)/.exec(line);
    if (t) type = t[1];
    const n = /^\s*-?\s*name:\s*["']?([a-z0-9-]+)/.exec(line);
    if (n && type === "web") names.push(n[1]);
  }
  return names;
}

export function extractFindings(files: Record<string, string>): Findings {
  const f: Findings = {
    supabase: [],
    appwrite: [],
    render: [],
    huggingface: [],
    mongodb: [],
    koyeb: [],
  };
  const seen = new Set<string>();
  const once = (key: string) => !seen.has(key) && seen.add(key);

  for (const [source, text] of Object.entries(files)) {
    for (const m of text.matchAll(SUPABASE)) {
      const url = `https://${m[1]}.supabase.co`;
      if (isRealRef(m[1]) && once(url)) f.supabase.push({ url, source });
    }
    const endpoint = APPWRITE_ENDPOINT.exec(text)?.[0];
    if (endpoint && once(`aw:${endpoint}`)) {
      f.appwrite.push({ endpoint, projectId: APPWRITE_PROJECT.exec(text)?.[1] ?? null, source });
    }
    for (const m of text.matchAll(HF_SPACE)) {
      if (once(`hf:${m[1]}`)) f.huggingface.push({ id: m[1], source });
    }
    for (const m of text.matchAll(ATLAS)) {
      const host = m[1].toLowerCase();
      if (!/x{4,}|<|example/.test(host) && once(`mongo:${host}`)) f.mongodb?.push({ host, source });
    }
    for (const m of text.matchAll(KOYEB)) {
      const url = `https://${m[1]}`;
      if (once(url)) f.koyeb?.push({ url, source });
    }
    if (source === "render.yaml") {
      for (const name of renderServices(text)) {
        const url = `https://${name}.onrender.com`;
        if (once(url)) f.render.push({ url, source });
      }
    }
  }
  return f;
}

/** A scheduled workflow whose job pings something: the hand-rolled keep-alive pattern. */
export function looksLikeKeepAlive(workflow: string): boolean {
  const scheduled = /^\s*schedule:/m.test(workflow);
  const pings =
    /(curl|wget|fetch\(|keep.?alive|keepalive|ping|wake|supabase|onrender|hf\.space)/i.test(
      workflow,
    );
  return scheduled && pings && !/npm publish|release|deploy/i.test(workflow);
}
