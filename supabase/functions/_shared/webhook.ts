/** Posts plain text to a Discord or Slack incoming webhook. False on any failure, never throws. */
export async function postWebhook(
  kind: string,
  url: string,
  text: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const body = kind === "discord"
    ? { content: text.slice(0, 2000), allowed_mentions: { parse: [] } }
    : { text };
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    await res.body?.cancel().catch(() => {});
    return res.ok;
  } catch {
    return false;
  }
}
