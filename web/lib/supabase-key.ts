/** Decides whether a pasted Supabase key is safe for us to store as a ping secret. */

/**
 * Only a project's public key is acceptable: a legacy JWT whose role claim is `anon`, or a
 * new-style `sb_publishable_` key. A service-role or `sb_secret_` key bypasses the user's
 * RLS entirely, and we refuse to hold one.
 */
export function isPublicSupabaseKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.startsWith("sb_publishable_")) return true;
  const parts = trimmed.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload?.role === "anon";
  } catch {
    return false;
  }
}
