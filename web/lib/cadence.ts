/** How often a target may be pinged: the plan floor, overridden where a platform sleeps faster. */

export type CadenceLimits = {
  min_interval_seconds: number;
  platform_min_interval_seconds?: Record<string, number>;
};

export function cadenceFloor(limits: CadenceLimits, platform?: string): number {
  return (platform && limits.platform_min_interval_seconds?.[platform]) || limits.min_interval_seconds;
}

/** Raises a requested cadence to the floor; never rejects it. */
export function clampCadence(limits: CadenceLimits, requestedSeconds: number, platform?: string): number {
  return Math.max(requestedSeconds, cadenceFloor(limits, platform));
}
