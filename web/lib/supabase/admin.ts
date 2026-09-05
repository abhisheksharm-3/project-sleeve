import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely, so every query made with it must filter by
 * user id explicitly — nothing else will.
 *
 * Reserved for the three things the session client cannot do: writing targets and projects
 * after an entitlement check, reading github_credentials, and appending analytics events.
 * The `server-only` import makes importing this from a client component a build error.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
