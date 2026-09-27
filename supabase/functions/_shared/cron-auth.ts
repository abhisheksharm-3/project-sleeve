/** The shared-secret check both engine functions use, since they run with verify_jwt off. */

/** Compares without leaking the secret's contents through response timing. */
export function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** True when the request carries the cron secret; false when the secret is unset. */
export function isCronRequest(req: Request): boolean {
  const expected = Deno.env.get("SLEEVE_CRON_SECRET");
  return !!expected && secretMatches(req.headers.get("x-sleeve-cron"), expected);
}
