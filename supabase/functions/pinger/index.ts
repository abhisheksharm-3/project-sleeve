/**
 * One engine cycle per call. Deployed with verify_jwt off, so the cron shared secret is the
 * only thing between the internet and the job queue; pg_cron sends it as a header.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/cron-auth.ts";
import { runCycle } from "./engine.ts";

Deno.serve(async (req) => {
  if (!isCronRequest(req)) return new Response("forbidden", { status: 403 });

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
