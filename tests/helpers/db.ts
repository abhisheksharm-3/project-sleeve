import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function getServiceClient(): SupabaseClient {
  return createClient(URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function resetEngineTables(db: SupabaseClient): Promise<void> {
  // child-first order; truncate restarts identity
  const { error } = await db.rpc("truncate_engine_tables");
  if (error) throw error;
}
