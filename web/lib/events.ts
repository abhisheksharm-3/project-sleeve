/** Appends activation-funnel events (spec §8, Tier 2). Never blocks the action it records. */
import "server-only";
import { createAdminClient } from "./supabase/admin";

export type EventName =
  | "repo_imported"
  | "project_created"
  | "target_added"
  | "target_tested"
  | "target_removed";

export async function track(userId: string, name: EventName, props: Record<string, unknown> = {}) {
  const { error } = await createAdminClient()
    .from("events")
    .insert({ user_id: userId, name, props });
  if (error) console.error(`event ${name} not recorded: ${error.message}`);
}
