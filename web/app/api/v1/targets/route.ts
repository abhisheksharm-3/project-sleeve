/**
 * POST /api/v1/targets — add a website or heartbeat to a project, for scripts and CI.
 * DELETE /api/v1/targets?url=… — remove the website with that URL, for tearing down a
 * preview deployment. Both take the same checks as the forms: the URL must be public, and
 * the plan's limits apply.
 */
import { randomBytes } from "node:crypto";
import { apiError, apiUser, ownedProject, targetCount } from "@/lib/api";
import { entitlements } from "@/lib/entitlements";
import { HEARTBEAT_PERIODS } from "@/lib/heartbeat";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateTargetUrl } from "@/lib/target-url";

type Body = {
  project_id?: string;
  kind?: "website" | "heartbeat";
  url?: string;
  label?: string;
  interval_seconds?: number;
};

export async function POST(request: Request) {
  const userId = await apiUser(request);
  if (!userId) return apiError(401, "Send a valid API token as Authorization: Bearer <token>.");
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return apiError(400, "Send a JSON body.");
  if (!body.project_id || !(await ownedProject(userId, body.project_id)))
    return apiError(404, "No project of yours has that project_id.");

  const limits = await entitlements(userId);
  if (!limits.canAddTarget(await targetCount(userId)))
    return apiError(
      403,
      `The ${limits.planName} plan allows ${limits.limits.max_targets} backends.`,
    );

  const admin = createAdminClient();
  if (body.kind === "heartbeat") {
    const label = body.label?.trim().slice(0, 80);
    const period = HEARTBEAT_PERIODS.find((p) => p.seconds === body.interval_seconds);
    if (!label) return apiError(400, "A heartbeat needs a label.");
    if (!period)
      return apiError(
        400,
        `interval_seconds must be one of ${HEARTBEAT_PERIODS.map((p) => p.seconds).join(", ")}.`,
      );
    const token = randomBytes(32).toString("base64url");
    const ping = `${siteUrl()}/h/${token}`;
    const { data, error } = await admin
      .from("targets")
      .insert({
        project_id: body.project_id,
        platform: "heartbeat",
        heartbeat_type: "inbound",
        url: ping,
        secret: token,
        label,
        interval_seconds: period.seconds,
      })
      .select("id")
      .single();
    if (error || !data) return apiError(500, "Could not save the heartbeat.");
    return Response.json({ id: data.id, kind: "heartbeat", ping_url: ping }, { status: 201 });
  }

  if (body.kind !== "website") return apiError(400, 'kind must be "website" or "heartbeat".');
  const check = await validateTargetUrl(String(body.url ?? ""));
  if (!check.ok) return apiError(400, check.reason);
  const interval = limits.clampInterval(Number(body.interval_seconds) || 86_400, "custom");
  const { data, error } = await admin
    .from("targets")
    .insert({
      project_id: body.project_id,
      platform: "custom",
      heartbeat_type: "plain",
      url: check.url,
      label: body.label?.trim().slice(0, 80) || null,
      interval_seconds: interval,
    })
    .select("id")
    .single();
  if (error || !data) return apiError(500, "Could not save the website.");
  return Response.json(
    { id: data.id, kind: "website", url: check.url, interval_seconds: interval },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const userId = await apiUser(request);
  if (!userId) return apiError(401, "Send a valid API token as Authorization: Bearer <token>.");
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return apiError(400, "Pass the website's url, or delete /api/v1/targets/<id>.");
  const admin = createAdminClient();
  const { data: projects } = await admin.from("projects").select("id").eq("user_id", userId);
  const ids = (projects ?? []).map((p) => p.id);
  const check = await validateTargetUrl(url);
  const { data: removed } = ids.length
    ? await admin
        .from("targets")
        .delete()
        .in("project_id", ids)
        .eq("platform", "custom")
        .in("url", check.ok ? [url, check.url] : [url])
        .select("id")
    : { data: [] };
  return Response.json({ removed: (removed ?? []).map((r) => r.id) });
}
