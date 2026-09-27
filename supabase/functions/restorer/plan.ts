/** What the restorer does with one project, decided from its Supabase status. Pure. */

export type Action = "restore" | "wait" | "leave";

/**
 * INACTIVE is Supabase's word for paused. RESTORING and COMING_UP mean a restore is already
 * on its way; anything else is up or failing for a reason a restore will not fix.
 */
export function actionFor(status: string): Action {
  if (status === "INACTIVE") return "restore";
  if (status === "RESTORING" || status === "COMING_UP") return "wait";
  return "leave";
}

/** The project ref from a Supabase URL, or null when the host is not a Supabase project. */
export function refFromUrl(url: string): string | null {
  try {
    const m = new URL(url).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function restoredMessage(project: string, siteUrl: string): string {
  const name = project.split("/").pop() ?? project;
  return `**${name}: Supabase paused it, so we restored it.**\nRestoring takes a few minutes; checks carry on by themselves.\n${siteUrl}/dashboard`;
}

export function revokedMessage(siteUrl: string): string {
  return `**Auto-restore is off.** Supabase no longer accepts our access, so paused projects will not be restored for you. Connect Supabase again from a project to turn it back on.\n${siteUrl}/dashboard`;
}
