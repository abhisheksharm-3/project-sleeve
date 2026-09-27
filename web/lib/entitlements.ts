import "server-only";
import { cadenceFloor, clampCadence } from "./cadence";
import { createAdminClient } from "./supabase/admin";

export type Limits = {
  max_projects: number;
  max_targets: number;
  min_interval_seconds: number;
  /** Per-platform floors that replace the plan floor where a platform sleeps faster. */
  platform_min_interval_seconds?: Record<string, number>;
  heartbeat_types: string[];
  channels: string[];
};

/**
 * The one seam every limit decision goes through (spec §9).
 *
 * Nothing anywhere else may read `plan` or `status` and branch on it. That rule is what
 * makes adding Stripe a single webhook file: the webhook writes the same subscription
 * columns, and every gate tightens or loosens on its own because they all read this.
 */
export type Entitlements = {
  planId: string;
  planName: string;
  limits: Limits;
  minInterval: (platform?: string) => number;
  allowedHeartbeatTypes: () => string[];
  canAddProject: (currentCount: number) => boolean;
  canAddTarget: (currentCount: number) => boolean;
  /** Raise a requested cadence to the floor for this platform rather than rejecting it. */
  clampInterval: (requestedSeconds: number, platform?: string) => number;
};

const FREE_FALLBACK: Limits = {
  max_projects: 5,
  max_targets: 3,
  min_interval_seconds: 21_600,
  platform_min_interval_seconds: { render: 600, huggingface: 600 },
  heartbeat_types: ["plain", "db_query"],
  channels: ["email"],
};

export async function entitlements(userId: string): Promise<Entitlements> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("subscriptions")
    .select("status, plans (id, name, limits)")
    .eq("user_id", userId)
    .maybeSingle();

  const plan = data?.plans as unknown as { id: string; name: string; limits: Limits } | undefined;

  // A subscription that is past_due or canceled falls back to free limits, so an expiring
  // card tightens every gate at once without a single caller knowing it happened.
  const active = data?.status === "active" && plan;
  const limits = active ? plan.limits : FREE_FALLBACK;

  return {
    planId: active ? plan.id : "free",
    planName: active ? plan.name : "Free",
    limits,
    minInterval: (platform) => cadenceFloor(limits, platform),
    allowedHeartbeatTypes: () => limits.heartbeat_types,
    canAddProject: (currentCount) => currentCount < limits.max_projects,
    canAddTarget: (currentCount) => currentCount < limits.max_targets,
    clampInterval: (requestedSeconds, platform) => clampCadence(limits, requestedSeconds, platform),
  };
}
