"use server";
/** Every project and target mutation. Each one checks ownership, then entitlements, then writes. */
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appwriteRowUrl, isAppwriteId } from "@/lib/appwrite";
import { entitlements } from "@/lib/entitlements";
import { track } from "@/lib/events";
import { GitHubTokenMissing, githubToken, installationAccess, listRepos } from "@/lib/github";
import { HEARTBEAT_PERIODS } from "@/lib/heartbeat";
import { cadenceForSpace, parseSpaceId, resolveSpace } from "@/lib/huggingface";
import { parseAtlasUri } from "@/lib/mongodb";
import { probeTarget } from "@/lib/probe";
import { scanRepo } from "@/lib/repo-scan";
import { unseal } from "@/lib/sealed";
import { requireUser } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type ActiveConnect,
  CONNECT_COOKIE,
  CONNECT_PATH,
  connectConfig,
} from "@/lib/supabase-connect";
import { isPublicSupabaseKey } from "@/lib/supabase-key";
import { installKeepalive, publicKey, restoreProject } from "@/lib/supabase-mgmt";
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
      repos.slice(0, room).map(({ private: _, ...r }) => ({ ...r, user_id: user.id })),
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
  const [userToken, { tokens }] = await Promise.all([
    githubToken(userId).catch(() => null),
    installationAccess(userId),
  ]);
  const admin = createAdminClient();
  await Promise.all(
    projects.map(async (p) => {
      const token = tokens.get(p.name) ?? userToken;
      if (!token) return;
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
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) fail("/dashboard", "That project is not yours.");
  if (!project.github_id)
    fail(`/projects/${id}`, "Only projects imported from GitHub can be scanned.");
  await scanProjects(user.id, [project]);
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}?scanned=1#found`);
}

/** Publishing is the owner's choice alone; members of a shared project cannot. */
export async function setPublic(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("project_id") ?? "");
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
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
  auto_restore?: boolean;
  label?: string;
};

const RENDER_CADENCE = 600;
const KOYEB_CADENCE = 1_800;

/** Platforms whose first request can outlast the check while the service wakes. */
const COLD_START = ["render", "huggingface", "koyeb"];

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
 * Atlas counts connections toward its 30-day pause, so the check connects and pings. The
 * connection string is the secret; the target's URL keeps only the host, for display.
 */
async function readAtlasTarget(formData: FormData, back: string): Promise<NewTarget> {
  const atlas = parseAtlasUri(String(formData.get("connection_string") ?? ""));
  if (!atlas)
    fail(
      back,
      "Paste the mongodb+srv:// connection string from Atlas, with the database user's username and password filled in.",
    );
  return {
    platform: "mongodb",
    url: `mongodb+srv://${atlas.host}`,
    heartbeat_type: "db_connect",
    secret: atlas.uri,
    cadence: 86_400,
  };
}

/**
 * An inbound heartbeat: the user's job pings a URL holding a random token, and silence past
 * the period plus grace is the failure. Nothing is probed; the first ping arrives later.
 */
async function readHeartbeatTarget(formData: FormData, back: string): Promise<NewTarget> {
  const label = String(formData.get("label") ?? "")
    .trim()
    .slice(0, 80);
  if (!label) fail(back, "Name the job, so its alerts say which one went quiet.");
  const period = Number(formData.get("period"));
  if (!HEARTBEAT_PERIODS.some((p) => p.seconds === period))
    fail(back, "Pick how often the job runs.");
  const token = randomBytes(32).toString("base64url");
  return {
    platform: "heartbeat",
    url: `${siteUrl()}/h/${token}`,
    heartbeat_type: "inbound",
    secret: token,
    label,
    cadence: period,
  };
}

/** Koyeb's free instance sleeps after an hour without HTTP traffic; a visit resets it. */
async function readKoyebTarget(formData: FormData, back: string): Promise<NewTarget> {
  const check = await validateTargetUrl(String(formData.get("url") ?? ""));
  if (!check.ok) fail(back, check.reason);
  if (!new URL(check.url).hostname.endsWith(".koyeb.app"))
    fail(back, "Use the service's public URL, which ends in .koyeb.app.");
  return {
    platform: "koyeb",
    url: check.url,
    heartbeat_type: "plain",
    secret: null,
    cadence: KOYEB_CADENCE,
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
    case "mongodb":
      return readAtlasTarget(formData, back);
    case "koyeb":
      return readKoyebTarget(formData, back);
    case "heartbeat":
      return readHeartbeatTarget(formData, back);
    default:
      return readCustomTarget(formData, back, allowed);
  }
}

/**
 * Check, then save, then record: the one path every new target takes, whether it came from a
 * form or from one-click Supabase setup. Never returns; it redirects to the project page.
 */
async function saveTarget(
  userId: string,
  projectId: string,
  target: Omit<NewTarget, "cadence">,
  interval: number,
  kind: string,
): Promise<never> {
  const back = `/projects/${projectId}`;
  const probe =
    target.heartbeat_type === "inbound"
      ? null
      : await probeTarget({
          platform: target.platform,
          url: target.url,
          heartbeat_type: target.heartbeat_type,
          method: target.method ?? "GET",
          secret: target.secret,
          platform_ref: target.platform_ref ?? null,
        });
  const waking =
    probe !== null && !probe.ok && probe.status === null && COLD_START.includes(target.platform);
  if (probe && !probe.ok && !waking) {
    const restore = probe.restoreUrl ? `&restore=${encodeURIComponent(probe.restoreUrl)}` : "";
    redirect(
      `${back}?add=${kind}&error=${encodeURIComponent(probe.diagnosis ?? "The check failed.")}${restore}#add`,
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("targets")
    .insert({ ...target, project_id: projectId, interval_seconds: interval })
    .select("id")
    .single();
  if (error || !data) fail(back, "Could not save the target.");
  if (probe?.ok) {
    await admin.from("ping_log").insert({
      target_id: data.id,
      ok: true,
      status_code: probe.status,
      latency_ms: probe.latencyMs,
    });
  }

  await track(userId, "target_added", {
    platform: target.platform,
    heartbeat_type: target.heartbeat_type,
  });
  revalidatePath(back);
  const checked = !probe ? "heartbeat" : waking ? "waking" : (probe.status ?? "connected");
  redirect(`${back}?added=${data.id}&checked=${checked}`);
}

export async function addTarget(formData: FormData) {
  const { supabase, user } = await requireUser();
  const projectId = String(formData.get("project_id") ?? "");
  const back = `/projects/${projectId}`;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
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

  await saveTarget(user.id, projectId, target, interval, String(formData.get("kind") ?? ""));
}

/** A backend in a project the user owns: for changes only the owner may make. */
async function ownedTarget(targetId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("targets")
    .select("id, project_id, projects!inner (user_id)")
    .eq("id", targetId)
    .eq("projects.user_id", user.id)
    .maybeSingle();
  if (!data) fail("/dashboard", "Only the project's owner can do that.");
  return { user, target: { id: data.id, project_id: data.project_id as string } };
}

/** A backend the user can see, owned or shared: for checks and maintenance. */
async function readableTarget(targetId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("targets")
    .select("id, project_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!data) fail("/dashboard", "That backend is not in any of your projects.");
  return { user, target: data };
}

/**
 * Brings the target's next run forward to now; the engine's next minute tick pings it.
 * The app never calls the engine directly — they share only the database (spec §3).
 */
export async function testTarget(formData: FormData) {
  const { user, target } = await readableTarget(String(formData.get("target_id") ?? ""));
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

const PGRST_RELOAD_TRIES = 5;

/**
 * One-click Supabase setup, step two: with the token from the sealed cookie, read the
 * project's public key, install keepalive(), and save the target through saveTarget. The
 * token is dropped with the cookie before the redirect.
 */
export async function provisionSupabase(formData: FormData) {
  const { supabase, user } = await requireUser();
  const config = connectConfig();
  const jar = await cookies();
  const active = config
    ? unseal<ActiveConnect>(jar.get(CONNECT_COOKIE)?.value, config.clientSecret)
    : null;
  if (!active || active.userId !== user.id)
    fail("/dashboard", "Your Supabase connection expired. Connect again.");

  const back = `/projects/${active.projectId}`;
  const ref = String(formData.get("ref") ?? "");
  if (!/^[a-z0-9]{20}$/.test(ref)) fail(back, "Pick one of your Supabase projects.");
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", active.projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) fail("/dashboard", "That project is not yours.");

  const limits = await entitlements(user.id);
  if (!limits.canAddTarget(await countTargets(user.id))) {
    fail(back, `The ${limits.planName} plan allows ${limits.limits.max_targets} targets.`);
  }

  let key: string | null;
  try {
    key = await publicKey(active.token, ref);
    if (key) await installKeepalive(active.token, ref);
  } catch (e) {
    fail(`${back}?add=supabase`, e instanceof Error ? e.message : "Supabase setup failed.");
  }
  if (!key)
    fail(`${back}?add=supabase`, "That project has no anon or publishable key to check it with.");

  const url = `https://${ref}.supabase.co/rest/v1/rpc/keepalive`;
  for (let i = 0; i < PGRST_RELOAD_TRIES; i++) {
    const probe = await probeTarget({
      platform: "supabase",
      url,
      heartbeat_type: "db_query",
      method: "GET",
      secret: key,
      platform_ref: null,
    });
    if (probe.ok || probe.status !== 404) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  jar.delete({ name: CONNECT_COOKIE, path: CONNECT_PATH });

  const autoRestore = formData.get("auto_restore") === "on" && active.refresh !== null;
  if (autoRestore)
    await createAdminClient().rpc("store_supabase_grant", {
      p_user: user.id,
      p_refresh: active.refresh,
    });

  await saveTarget(
    user.id,
    active.projectId,
    {
      platform: "supabase",
      url,
      heartbeat_type: "db_query",
      secret: key,
      auto_restore: autoRestore,
    },
    limits.clampInterval(21_600, "supabase"),
    "supabase",
  );
}

/** Restores a paused Supabase project once, with the token from the connect flow. Stores nothing. */
export async function restoreSupabaseNow(formData: FormData) {
  const { user } = await requireUser();
  const config = connectConfig();
  const active = config
    ? unseal<ActiveConnect>((await cookies()).get(CONNECT_COOKIE)?.value, config.clientSecret)
    : null;
  if (!active || active.userId !== user.id)
    fail("/dashboard", "Your Supabase connection expired. Connect again.");
  const ref = String(formData.get("ref") ?? "");
  if (!/^[a-z0-9]{20}$/.test(ref)) fail(CONNECT_PATH, "Pick one of your Supabase projects.");
  try {
    await restoreProject(active.token, ref);
  } catch (e) {
    fail(CONNECT_PATH, e instanceof Error ? e.message : "Supabase would not restore it.");
  }
  redirect(`${CONNECT_PATH}?restoring=${ref}`);
}

/**
 * Turns auto-restore off for one backend. When it was the last one, the stored Supabase
 * token is deleted too, so nothing is kept that nothing uses.
 */
export async function stopAutoRestore(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("target_id") ?? "");
  const { data: target } = await supabase
    .from("targets")
    .select("id, project_id, projects!inner (user_id)")
    .eq("id", id)
    .eq("projects.user_id", user.id)
    .maybeSingle();
  if (!target) fail("/dashboard", "Only the project's owner can do that.");
  const admin = createAdminClient();
  await admin.from("targets").update({ auto_restore: false }).eq("id", id);
  const { count } = await admin
    .from("targets")
    .select("id", { count: "exact", head: true })
    .eq("auto_restore", true)
    .in("project_id", await userProjectIds(user.id));
  if (!count) await admin.rpc("drop_supabase_grant", { p_user: user.id });
  revalidatePath(`/projects/${target.project_id}`);
  redirect(`/projects/${target.project_id}`);
}

const MAINTENANCE_HOURS = [1, 3, 12, 24, 72, 168];

/**
 * Starts a maintenance window now. Checks keep running; alerts are held and status pages
 * say it is planned. A window already in force is replaced rather than stacked.
 */
export async function startMaintenance(formData: FormData) {
  const { user, target } = await readableTarget(String(formData.get("target_id") ?? ""));
  const back = `/projects/${target.project_id}`;
  const hours = Number(formData.get("hours"));
  if (!MAINTENANCE_HOURS.includes(hours)) fail(back, "Pick how long the maintenance lasts.");
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 200) || null;
  const now = new Date();
  const admin = createAdminClient();
  await admin
    .from("maintenance_windows")
    .update({ ends_at: now.toISOString() })
    .eq("target_id", target.id)
    .gt("ends_at", now.toISOString());
  await admin.from("maintenance_windows").insert({
    target_id: target.id,
    starts_at: now.toISOString(),
    ends_at: new Date(now.getTime() + hours * 3_600_000).toISOString(),
    note,
  });
  await track(user.id, "maintenance_started", { hours });
  revalidatePath(back);
  redirect(back);
}

export async function endMaintenance(formData: FormData) {
  const { target } = await readableTarget(String(formData.get("target_id") ?? ""));
  const now = new Date().toISOString();
  await createAdminClient()
    .from("maintenance_windows")
    .update({ ends_at: now })
    .eq("target_id", target.id)
    .lte("starts_at", now)
    .gt("ends_at", now);
  revalidatePath(`/projects/${target.project_id}`);
  redirect(`/projects/${target.project_id}`);
}
