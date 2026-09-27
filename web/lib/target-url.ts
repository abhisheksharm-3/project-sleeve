/** Config-time validation of a target URL before the engine is allowed to fetch it. */
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Addresses a keep-alive ping has no business reaching: loopback, private networks,
 * link-local (which includes the 169.254.169.254 cloud metadata endpoint), CGNAT,
 * multicast and reserved space.
 */
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv6");
}

/**
 * An IPv4-mapped IPv6 address (::ffff:10.0.0.1) is judged by the IPv4 address inside it.
 * A /96 rule for the mapped range would be wrong here: BlockList also matches plain IPv4
 * addresses against mapped IPv6 rules, so it would block every IPv4 address.
 */
export function isBlockedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isBlockedAddress(mapped[1]);
  const family = isIP(address);
  if (family === 0) return true;
  return BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

export type Lookup = (host: string) => Promise<{ address: string }[]>;

const systemLookup: Lookup = (host) => lookup(host, { all: true });

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Accepts only a public http(s) URL whose every resolved address is public.
 *
 * ponytail: resolves once at config time, so DNS rebinding (a host that turns private
 * after it is saved) is not covered; re-resolving in the engine before each fetch is the
 * upgrade path if targets ever come from untrusted bulk sources.
 */
export async function validateTargetUrl(
  raw: string,
  resolve: Lookup = systemLookup,
): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That is not a valid URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only http and https URLs can be pinged." };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: "Remove the credentials from the URL; use the secret field instead.",
    };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return {
      ok: false,
      reason: "That host is private. Targets must be reachable from the internet.",
    };
  }

  let addresses: { address: string }[];
  try {
    addresses = isIP(host) ? [{ address: host }] : await resolve(host);
  } catch {
    return { ok: false, reason: `Could not resolve ${host}. Check the domain is live.` };
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    return { ok: false, reason: "That host points at a private address. Targets must be public." };
  }
  return { ok: true, url: url.toString() };
}

/**
 * The URL that actually resets a Supabase project's inactivity clock: a table read through
 * PostgREST. The /rest/v1/ root answers 401 to an anon key on current projects.
 */
export function supabaseTableUrl(projectUrl: string, table: string): string | null {
  let base: URL;
  try {
    base = new URL(projectUrl.trim());
  } catch {
    return null;
  }
  if (!/^[a-z0-9]{20}\.supabase\.co$/.test(base.hostname)) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(table.trim())) return null;
  return `https://${base.hostname}/rest/v1/${table.trim()}?limit=1`;
}
