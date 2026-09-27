/** Reads health and the 14-day strip for a set of targets through the caller's RLS. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Health } from "./health";

export type Day = { target_id: string; day: string; pings: number; ok: number };

export async function loadHealth(supabase: SupabaseClient, targetIds: string[]) {
  if (targetIds.length === 0)
    return { health: new Map<string, Health>(), days: new Map<string, Day[]>() };
  const [{ data: rows }, { data: dayRows }] = await Promise.all([
    supabase.from("target_health").select("*").in("target_id", targetIds),
    supabase.from("target_daily_uptime").select("*").in("target_id", targetIds),
  ]);
  const health = new Map(((rows ?? []) as Health[]).map((h) => [h.target_id, h]));
  const days = new Map<string, Day[]>();
  for (const d of (dayRows ?? []) as Day[])
    days.set(d.target_id, [...(days.get(d.target_id) ?? []), d]);
  return { health, days };
}
