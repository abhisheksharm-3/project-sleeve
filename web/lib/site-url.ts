/**
 * This app's own absolute origin, and the only thing allowed to define it.
 *
 * Never derive an origin from request headers. `Host` and `X-Forwarded-Host` are set by the
 * caller, so an OAuth `redirect_uri` built from them lets an attacker point the
 * authorization code at a host they control. Supabase's redirect allow list would refuse
 * that today, but a single broad entry in a remote config is not where this defence belongs.
 *
 * Set NEXT_PUBLIC_SITE_URL per environment. Localhost is the development default only.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Resolve a caller-supplied `next` into an absolute URL on this origin, or fall back home.
 *
 * `//evil.com` and `/\evil.com` are both read as another origin by browsers, so a prefix
 * check alone is not enough — the resolved origin is compared as well.
 */
export function safeRedirect(raw: string | null, base: string = siteUrl()): string {
  const fallback = `${base}/`;
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  try {
    const target = new URL(raw, base);
    return target.origin === new URL(base).origin ? target.toString() : fallback;
  } catch {
    return fallback;
  }
}
