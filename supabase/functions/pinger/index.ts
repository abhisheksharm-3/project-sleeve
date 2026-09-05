import { createClient } from "npm:@supabase/supabase-js@2";
import { runCycle } from "./engine.ts";

/** Compare without leaking the secret's contents through response timing. */
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  // This function is deployed with verify_jwt disabled, so the shared secret is the only
  // thing standing between the internet and the job queue. pg_cron sends it as a header.
  const expected = Deno.env.get("SLEEVE_CRON_SECRET");
  if (!expected || !secretMatches(req.headers.get("x-sleeve-cron"), expected)) {
    return new Response("forbidden", { status: 403 });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const result = await runCycle(db, { jitterSeconds: 20 });
    return Response.json(result);
  } catch (e) {
    // the detail goes to the function log, never to the caller
    console.error(`cycle failed: ${e instanceof Error ? e.message : String(e)}`);
    return new Response("cycle failed", { status: 500 });
  }
});
