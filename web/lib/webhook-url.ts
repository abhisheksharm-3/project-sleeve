/**
 * Accepts only Discord and Slack incoming-webhook URLs, the same rule the database checks,
 * so the server never posts to an address a user chose.
 */
export type WebhookKind = "discord" | "slack";

export function webhookKind(raw: string): WebhookKind | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
  if (
    (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
    /^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)
  )
    return "discord";
  if (url.hostname === "hooks.slack.com" && /^\/services\/[\w/]+$/.test(url.pathname))
    return "slack";
  return null;
}
