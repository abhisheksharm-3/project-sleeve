/**
 * Every 30 minutes: for opted-in Supabase backends whose latest check failed, ask Supabase
 * whether the project is paused and restore it if so. Each user's refresh token is used
 * once per run and replaced with the one Supabase returns, since Supabase rotates them. A
 * token Supabase rejects is forgotten, and auto-restore is switched off for that user.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { isCronRequest } from "../_shared/cron-auth.ts";
import { postWebhook } from "../_shared/webhook.ts";
import { actionFor, refFromUrl, restoredMessage, revokedMessage } from "./plan.ts";

const API = "https://api.supabase.com";

type Candidate = {
  target_id: string;
  user_id: string;
  url: string;
  project_name: string;
  webhook_kind: string | null;
  webhook_url: string | null;
};

async function refresh(
  token: string,
): Promise<{ access: string; refresh: string } | "revoked" | null> {
  const id = Deno.env.get("SLEEVE_OAUTH_CLIENT_ID");
  const secret = Deno.env.get("SLEEVE_OAUTH_CLIENT_SECRET");
  if (!id || !secret) return null;
  const res = await fetch(`${API}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 400 || res.status === 401) return "revoked";
  if (!res.ok) return null;
  const body = await res.json() as { access_token?: string; refresh_token?: string };
  return body.access_token && body.refresh_token
    ? { access: body.access_token, refresh: body.refresh_token }
    : null;
}

async function projectStatus(access: string, ref: string): Promise<string | null> {
  const res = await fetch(`${API}/v1/projects/${ref}`, {
    headers: { authorization: `Bearer ${access}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { status?: string }).status ?? null;
}

async function restore(access: string, ref: string): Promise<boolean> {
  const res = await fetch(`${API}/v1/projects/${ref}/restore`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}` },
    signal: AbortSignal.timeout(20_000),
  });
  await res.body?.cancel().catch(() => {});
  return res.ok;
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
  const site = Deno.env.get("SITE_URL") ?? "https://projectsleeve.vercel.app";

  const { data, error } = await db.rpc("restore_candidates");
  if (error) return new Response(`read failed: ${error.message}`, { status: 500 });
  const byUser = new Map<string, Candidate[]>();
  for (const c of (data ?? []) as Candidate[]) {
    byUser.set(c.user_id, [...(byUser.get(c.user_id) ?? []), c]);
  }

  const report = { users: byUser.size, restored: 0, waiting: 0, revoked: 0 };
  for (const [userId, candidates] of byUser) {
    const { data: stored } = await db.rpc("read_supabase_grant", { p_user: userId });
    if (!stored) continue;
    const tokens = await refresh(stored as string);
    const channel = candidates.find((c) => c.webhook_url && c.webhook_kind);
    if (tokens === "revoked") {
      await db.rpc("drop_supabase_grant", { p_user: userId });
      if (channel) {
        await postWebhook(channel.webhook_kind!, channel.webhook_url!, revokedMessage(site));
      }
      report.revoked++;
      continue;
    }
    if (!tokens) continue;
    await db.rpc("store_supabase_grant", { p_user: userId, p_refresh: tokens.refresh });

    for (const c of candidates) {
      const ref = refFromUrl(c.url);
      const status = ref ? await projectStatus(tokens.access, ref) : null;
      const action = status ? actionFor(status) : "leave";
      if (action === "wait") report.waiting++;
      if (action !== "restore" || !ref || !(await restore(tokens.access, ref))) continue;
      report.restored++;
      await db.from("events").insert({
        user_id: userId,
        name: "supabase_restored",
        props: { target_id: c.target_id, ref },
      });
      if (channel) {
        await postWebhook(
          channel.webhook_kind!,
          channel.webhook_url!,
          restoredMessage(c.project_name, site),
        );
      }
    }
  }
  return Response.json(report);
});
