"use server";
/** Saving, testing and removing the user's alert and digest webhook. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { webhookKind } from "@/lib/webhook-url";

const PAGE = "/notifications";

function back(query: string): never {
  redirect(`${PAGE}?${query}`);
}

export async function saveChannel(formData: FormData) {
  const { user } = await requireUser();
  const url = String(formData.get("webhook_url") ?? "").trim();
  const kind = webhookKind(url);
  if (!kind) back(`error=${encodeURIComponent("Paste a Discord or Slack incoming webhook URL.")}`);
  const { error } = await createAdminClient()
    .from("notification_channels")
    .upsert(
      {
        user_id: user.id,
        kind,
        webhook_url: url,
        alerts: formData.get("alerts") === "on",
        digest: formData.get("digest") === "on",
      },
      { onConflict: "user_id" },
    );
  if (error) back(`error=${encodeURIComponent("Could not save that webhook.")}`);
  revalidatePath(PAGE);
  back("saved=1");
}

export async function sendTest() {
  const { supabase } = await requireUser();
  const { data: channel } = await supabase
    .from("notification_channels")
    .select("kind, webhook_url")
    .maybeSingle();
  if (!channel || webhookKind(channel.webhook_url) !== channel.kind)
    back(`error=${encodeURIComponent("Save a webhook first.")}`);
  const text = "ProjectSleeve is connected. Alerts and your Monday digest will arrive here.";
  const res = await fetch(channel.webhook_url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      channel.kind === "discord" ? { content: text, allowed_mentions: { parse: [] } } : { text },
    ),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  back(
    res?.ok
      ? "tested=1"
      : `error=${encodeURIComponent(`${channel.kind === "discord" ? "Discord" : "Slack"} did not accept the test message. Check the webhook still exists.`)}`,
  );
}

export async function removeChannel() {
  const { user } = await requireUser();
  await createAdminClient().from("notification_channels").delete().eq("user_id", user.id);
  revalidatePath(PAGE);
  back("removed=1");
}
