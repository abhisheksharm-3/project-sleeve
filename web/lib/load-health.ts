/** Reads health, the daily history and any maintenance in force, through the caller's RLS. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Maintenance } from "./describe";
import type { Health } from "./health";

export type Day = { target_id: string; day: string; pings: number; ok: number };

export async function loadHealth(supabase: SupabaseClient, targetIds: string[]) {
  if (targetIds.length === 0)
    return {
      health: new Map<string, Health>(),
      days: new Map<string, Day[]>(),
      maintenance: new Map<string, Maintenance>(),
    };
  const nowIso = new Date().toISOString();
  const [{ data: rows }, { data: dayRows }, { data: windows }] = await Promise.all([
    supabase.from("target_health").select("*").in("target_id", targetIds),
    supabase.from("target_daily_uptime").select("*").in("target_id", targetIds),
    supabase
      .from("maintenance_windows")
      .select("target_id, ends_at, note")
      .in("target_id", targetIds)
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso),
  ]);
  const maintenance = new Map(
    (windows ?? []).map((w) => [w.target_id as string, { ends_at: w.ends_at, note: w.note }]),
  );
  const health = new Map(((rows ?? []) as Health[]).map((h) => [h.target_id, h]));
  const days = new Map<string, Day[]>();
  for (const d of (dayRows ?? []) as Day[])
    days.set(d.target_id, [...(days.get(d.target_id) ?? []), d]);
  return { health, days, maintenance };
}
