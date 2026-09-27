/** Every 15 minutes: open or resolve alerts from target health, then email the new ones. */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/cron-auth.ts";
import { type Alert, composeEmail, type Email } from "./message.ts";

/**
 * Sends through Resend. Returns false on any failure so the alert stays unnotified and is
 * retried on the next run instead of being silently dropped.
 */
async function send(email: Email, apiKey: string, from: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text }),
    signal: AbortSignal.timeout(15_000),
  });
  await res.body?.cancel().catch(() => {});
  return res.ok;
}

async function deliver(db: SupabaseClient, alerts: Alert[]) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM") ?? "ProjectSleeve <onboarding@resend.dev>";
  const site = Deno.env.get("SITE_URL") ?? "https://projectsleeve.vercel.app";
  const now = Date.now();

  if (!apiKey) {
    return {
      pending: alerts.length,
      sent: 0,
      dryRun: alerts.map((a) => composeEmail(a, site, now).subject),
    };
  }

  let sent = 0;
  for (const alert of alerts) {
    if (!(await send(composeEmail(alert, site, now), apiKey, from))) {
      console.error(`alert ${alert.alert_id} not delivered`);
      continue;
    }
    await db.from("alerts").update({ notified_at: new Date().toISOString() }).eq(
      "id",
      alert.alert_id,
    );
    sent++;
  }
  return { pending: alerts.length, sent };
}

Deno.serve(async (req) => {
  if (!isCronRequest(req)) return new Response("forbidden", { status: 403 });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { error: syncError } = await db.rpc("sync_alerts");
  if (syncError) {
    console.error(`sync_alerts failed: ${syncError.message}`);
    return new Response("sync failed", { status: 500 });
  }
  const { data, error } = await db.rpc("pending_alerts");
  if (error) {
    console.error(`pending_alerts failed: ${error.message}`);
    return new Response("read failed", { status: 500 });
  }
  return Response.json(await deliver(db, (data ?? []) as Alert[]));
});
