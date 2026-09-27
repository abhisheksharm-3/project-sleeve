/** Resolves a Hugging Face Space to the URL that wakes it and the timeout that sleeps it. */

const SPACE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

/**
 * Accepts `owner/name`, `https://huggingface.co/spaces/owner/name`, or null for anything
 * else. An `hf.space` subdomain cannot be mapped back to an id reliably (both halves may
 * contain dashes), so it is refused with a pointer to the Space page instead.
 */
export function parseSpaceId(input: string): string | null {
  const raw = input.trim().replace(/\/+$/, "");
  const fromUrl = /^https?:\/\/(?:www\.)?huggingface\.co\/spaces\/([^/?#]+\/[^/?#]+)/.exec(raw);
  const id = fromUrl ? fromUrl[1] : raw;
  return SPACE_ID.test(id) ? id : null;
}

export type Space = { id: string; url: string; stage: string; sleepSeconds: number | null };

type Runtime = {
  stage?: string;
  gcTimeout?: number | null;
  domains?: { domain: string; stage: string }[];
};

/**
 * Reads the public runtime record. `gcTimeout` is the Space's own sleep window in seconds;
 * measured at 86400 (24h) on a free cpu-basic Space, not the 48h commonly quoted, which is
 * why cadence is derived from it rather than assumed.
 */
export async function resolveSpace(
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<Space | null> {
  const res = await fetchFn(`https://huggingface.co/api/spaces/${id}/runtime`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const runtime = (await res.json()) as Runtime;
  const domain = runtime.domains?.find((d) => d.domain.endsWith(".hf.space"))?.domain;
  if (!domain) return null;
  return {
    id,
    url: `https://${domain}/`,
    stage: runtime.stage ?? "UNKNOWN",
    sleepSeconds: typeof runtime.gcTimeout === "number" ? runtime.gcTimeout : null,
  };
}

/** Ping at half the sleep window so one missed tick never lets the Space fall asleep. */
export function cadenceForSpace(sleepSeconds: number | null, fallback: number): number {
  return sleepSeconds ? Math.min(fallback, Math.floor(sleepSeconds / 2)) : fallback;
}
