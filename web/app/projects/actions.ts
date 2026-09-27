"use server";
/** Every project and target mutation. Each one checks ownership, then entitlements, then writes. */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appwriteRowUrl, isAppwriteId } from "@/lib/appwrite";
import { entitlements } from "@/lib/entitlements";
import { track } from "@/lib/events";
import { GitHubTokenMissing, githubToken, listRepos } from "@/lib/github";
import { cadenceForSpace, parseSpaceId, resolveSpace } from "@/lib/huggingface";
import { probeTarget } from "@/lib/probe";
import { scanRepo } from "@/lib/repo-scan";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPublicSupabaseKey } from "@/lib/supabase-key";
import { supabaseTargetUrl, validateTargetUrl } from "@/lib/target-url";

const INTERVALS = [21_600, 43_200, 86_400];

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function userProjectIds(userId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("projects").select("id").eq("user_id", userId);
  return (data ?? []).map((p) => p.id);
}

async function countTargets(userId: string): Promise<number> {
  const ids = await userProjectIds(userId);
  if (ids.length === 0) return 0;
  const { count } = await createAdminClient()
    .from("targets")
    .select("id", { count: "exact", head: true })
    .in("project_id", ids);
  return count ?? 0;
}

/** Repo metadata is re-fetched from GitHub rather than trusted from the form. */
export async function importRepos(formData: FormData) {
  const { user } = await requireUser();
  const chosen = new Set(formData.getAll("repo").map(Number));
  if (chosen.size === 0) fail("/import", "Pick at least one repository.");

  let repos: Awaited<ReturnType<typeof listRepos>>;
  try {
    repos = (await listRepos(user.id)).filter((r) => chosen.has(r.github_id));
  } catch (e) {
    if (e instanceof GitHubTokenMissing)
      redirect("/login?error=Sign in again to read your repositories.");
    fail("/import", "GitHub is not answering right now. Try again in a minute.");
  }

  const limits = await entitlements(user.id);
  const existing = (await userProjectIds(user.id)).length;
  const room = limits.limits.max_projects - existing;
  if (room <= 0)
    fail("/import", `The ${limits.planName} plan allows ${limits.limits.max_projects} projects.`);

  const { data: saved, error } = await createAdminClient()
    .from("projects")
    .upsert(
      repos.slice(0, room).map((r) => ({ ...r, user_id: user.id })),
      { onConflict: "user_id,github_id" },
    )
    .select("id, name");
  if (error) fail("/import", "Could not save those projects.");
  await scanProjects(user.id, saved ?? []);

  await track(user.id, "repo_imported", { count: Math.min(repos.length, room) });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * Best effort: a scan that fails leaves the project without findings rather than failing
 * the import, and the project page offers to scan again.
 */
async function scanProjects(userId: string, projects: { id: string; name: string }[]) {
  const token = await githubToken(userId).catch(() => null);
  if (!token) return;
  const admin = createAdminClient();
  await Promise.all(
    projects.map(async (p) => {
      const scan = await scanRepo(p.name, token).catch(() => null);
      if (scan)
        await admin
          .from("projects")
          .update({ scan, scanned_at: new Date().toISOString() })
          .eq("id", p.id);
    }),
  );
}

export async function rescanProject(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("project_id") ?? "");
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, github_id")
    .eq("id", id)
    .maybeSingle();
  if (!project) fail("/dashboard", "That project is not yours.");
  if (!project.github_id)
    fail(`/projects/${id}`, "Only projects imported from GitHub can be scanned.");
  await scanProjects(user.id, [project]);
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}?scanned=1#found`);
}

/** Publishing is the owner's choice alone; the RLS read proves they own the project first. */
export async function setPublic(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("project_id") ?? "");
  const { data: project } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) fail("/dashboard", "That project is not yours.");
  await createAdminClient()
    .from("projects")
    .update({ public: formData.get("public") === "true" })
    .eq("id", id);
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}#share`);
}

export async function createProject(formData: FormData) {
  const { user } = await requireUser();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 100);
  if (!name) fail("/import", "Give the project a name.");

  const limits = await entitlements(user.id);
  if (!limits.canAddProject((await userProjectIds(user.id)).length)) {
    fail("/import", `The ${limits.planName} plan allows ${limits.limits.max_projects} projects.`);
  }

  const { data, error } = await createAdminClient()
    .from("projects")
    .insert({ user_id: user.id, name })
    .select("id")
    .single();
  if (error || !data) fail("/import", "Could not create the project.");

  await track(user.id, "project_created");
  redirect(`/projects/${data.id}`);
}

/** `cadence` is set when the platform, not the user, decides how often to ping. */
type NewTarget = {
  platform: string;
  url: string;
  heartbeat_type: string;
  secret: string | null;
  cadence?: number;
  method?: string;
  platform_ref?: string;
  pause_window_seconds?: number;
};

const RENDER_CADENCE = 600;

/** Platforms whose first request can outlast the check while the service wakes. */
const COLD_START = ["render", "huggingface"];

async function readSupabaseTarget(formData: FormData, back: string): Promise<NewTarget> {
  const url = supabaseTargetUrl(
    String(formData.get("project_url") ?? ""),
    String(formData.get("table") ?? ""),
  );
  if (!url)
    fail(
      back,
      "Use your project URL (https://<ref>.supabase.co) and a plain table name if you give one.",
    );
  const key = String(formData.get("anon_key") ?? "").trim();
  if (!isPublicSupabaseKey(key)) {
    fail(back, "That is not an anon or publishable key. Never paste a service-role key anywhere.");
  }
  return { platform: "supabase", url, heartbeat_type: "db_query", secret: key };
}

async function readCustomTarget(
  formData: FormData,
  back: string,
  allowed: string[],
): Promise<NewTarget> {
  const heartbeat = String(formData.get("heartbeat_type") ?? "plain");
  if (!allowed.includes(heartbeat)) fail(back, "Your plan does not include that heartbeat type.");
  const check = await validateTargetUrl(String(formData.get("url") ?? ""));
  if (!check.ok) fail(back, check.reason);
  return {
    platform: "custom",
    url: check.url,
    heartbeat_type: heartbeat,
    secret: heartbeat === "db_query" ? randomBytes(24).toString("base64url") : null,
  };
}

/**
 * Any inbound HTTP request resets Render's 15-minute spin-down clock. A workspace gets 750
 * free hours a month and one service kept awake uses about 744, so a second one in the same
 * workspace would get every free service in it suspended mid-month.
 */
async function readRenderTarget(
  formData: FormData,
  back: string,
  userId: string,
): Promise<NewTarget> {
  const ids = await userProjectIds(userId);
  const { count } = ids.length
    ? await createAdminClient()
        .from("targets")
        .select("id", { count: "exact", head: true })
        .eq("platform", "render")
        .in("project_id", ids)
    : { count: 0 };
  if ((count ?? 0) > 0 && formData.get("separate_workspace") !== "on") {
    fail(
      `${back}?add=render`,
      "You already keep a Render service awake. Two in the same workspace use up its 750 free hours and Render suspends all its free services mid-month. If this one is in a different workspace, tick the box and add it again.",
    );
  }
  const check = await validateTargetUrl(String(formData.get("url") ?? ""));
  if (!check.ok) fail(back, check.reason);
  return {
    platform: "render",
    url: check.url,
    heartbeat_type: "plain",
    secret: null,
    cadence: RENDER_CADENCE,
  };
}

/** A request to the Space's hf.space URL wakes it; measured: held 16s through a cold start. */
async function readHuggingFaceTarget(
  formData: FormData,
  back: string,
  fallback: number,
): Promise<NewTarget> {
  const id = parseSpaceId(String(formData.get("space") ?? ""));
  if (!id) fail(back, "Use the Space id (owner/name) or its huggingface.co/spaces URL.");
  const space = await resolveSpace(id);
  if (!space) fail(back, `Could not find a public Space called ${id}.`);
  const check = await validateTargetUrl(space.url);
  if (!check.ok) fail(back, check.reason);
  return {
    platform: "huggingface",
    url: check.url,
    heartbeat_type: "plain",
    secret: null,
    cadence: cadenceForSpace(space.sleepSeconds, fallback),
    pause_window_seconds: space.sleepSeconds ?? undefined,
  };
}

/**
 * Appwrite ignores every read toward its inactivity check, so the heartbeat is a write
 * into the table the user created for us, with a key scoped to rows.write only.
 */
async function readAppwriteTarget(formData: FormData, back: string): Promise<NewTarget> {
  const url = appwriteRowUrl(
    String(formData.get("endpoint") ?? ""),
    String(formData.get("appwrite_database") ?? ""),
    String(formData.get("appwrite_table") ?? ""),
  );
  if (!url)
    fail(
      back,
      "Use your Appwrite Cloud endpoint (e.g. https://fra.cloud.appwrite.io/v1), and the database and table ids shown in the Console.",
    );
  const projectId = String(formData.get("appwrite_project") ?? "").trim();
  if (!isAppwriteId(projectId)) fail(back, "That does not look like an Appwrite project id.");
  const key = String(formData.get("appwrite_key") ?? "").trim();
  if (key.length < 20) fail(back, "Paste the API key you created with the rows.write scope.");
  return {
    platform: "appwrite",
    url,
    heartbeat_type: "db_write",
    secret: key,
    method: "PUT",
    platform_ref: projectId,
  };
}

async function readTarget(
  formData: FormData,
  back: string,
  allowed: string[],
  userId: string,
): Promise<NewTarget> {
  switch (formData.get("kind")) {
    case "supabase":
      return readSupabaseTarget(formData, back);
    case "render":
      return readRenderTarget(formData, back, userId);
    case "appwrite":
      return readAppwriteTarget(formData, back);
    case "huggingface":
      return readHuggingFaceTarget(formData, back, INTERVALS[0]);
    default:
      return readCustomTarget(formData, back, allowed);
  }
}

export async function addTarget(formData: FormData) {
  const { supabase, user } = await requireUser();
  const projectId = String(formData.get("project_id") ?? "");
  const back = `/projects/${projectId}`;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) fail("/dashboard", "That project is not yours.");

  const limits = await entitlements(user.id);
  if (!limits.canAddTarget(await countTargets(user.id))) {
    fail(back, `The ${limits.planName} plan allows ${limits.limits.max_targets} targets.`);
  }

  const { cadence, ...target } = await readTarget(
    formData,
    back,
    limits.allowedHeartbeatTypes(),
    user.id,
  );

  const requested = Number(formData.get("interval_seconds"));
  const interval = limits.clampInterval(
    cadence ?? (INTERVALS.includes(requested) ? requested : INTERVALS[0]),
    target.platform,
  );

  const probe = await probeTarget({
    platform: target.platform,
    url: target.url,
    heartbeat_type: target.heartbeat_type,
    method: target.method ?? "GET",
    secret: target.secret,
    platform_ref: target.platform_ref ?? null,
  });
  const waking = !probe.ok && probe.status === null && COLD_START.includes(target.platform);
  if (!probe.ok && !waking) {
    const restore = probe.restoreUrl ? `&restore=${encodeURIComponent(probe.restoreUrl)}` : "";
    redirect(
      `${back}?add=${String(formData.get("kind") ?? "")}&error=${encodeURIComponent(probe.diagnosis ?? "The check failed.")}${restore}#add`,
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("targets")
    .insert({ ...target, project_id: projectId, interval_seconds: interval })
    .select("id")
    .single();
  if (error || !data) fail(back, "Could not save the target.");
  if (probe.ok) {
    await admin.from("ping_log").insert({
      target_id: data.id,
      ok: true,
      status_code: probe.status,
      latency_ms: probe.latencyMs,
    });
  }

  await track(user.id, "target_added", {
    platform: target.platform,
    heartbeat_type: target.heartbeat_type,
  });
  revalidatePath(back);
  redirect(`${back}?added=${data.id}&checked=${waking ? "waking" : probe.status}`);
}

async function ownedTarget(targetId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("targets")
    .select("id, project_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!data) fail("/dashboard", "That target is not yours.");
  return { user, target: data };
}

/**
 * Brings the target's next run forward to now; the engine's next minute tick pings it.
 * The app never calls the engine directly — they share only the database (spec §3).
 */
export async function testTarget(formData: FormData) {
  const { user, target } = await ownedTarget(String(formData.get("target_id") ?? ""));
  await createAdminClient()
    .from("jobs")
    .update({ next_run_at: new Date().toISOString() })
    .eq("target_id", target.id)
    .eq("status", "idle");
  await track(user.id, "target_tested");
  redirect(`/projects/${target.project_id}?queued=${target.id}`);
}

export async function removeTarget(formData: FormData) {
  const { user, target } = await ownedTarget(String(formData.get("target_id") ?? ""));
  await createAdminClient().from("targets").delete().eq("id", target.id);
  await track(user.id, "target_removed");
  revalidatePath(`/projects/${target.project_id}`);
  redirect(`/projects/${target.project_id}`);
}
