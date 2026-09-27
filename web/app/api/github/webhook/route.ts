/**
 * POST /api/github/webhook — the GitHub App's events. A push that touches a scanned file
 * re-scans every project on that repository; every push refreshes when its code was last
 * touched; an uninstall forgets the installation. Work runs after the response, so GitHub
 * gets its answer inside its ten-second limit.
 */
import { after, type NextRequest, NextResponse } from "next/server";
import { appJwt, installationToken } from "@/lib/github-app";
import { githubAppConfig } from "@/lib/github-app-config";
import { affectsScan, scanRepo } from "@/lib/repo-scan";
import { createAdminClient } from "@/lib/supabase/admin";
import { validSignature } from "@/lib/webhook-signature";

type Push = {
  repository: { id: number; full_name: string; pushed_at?: number };
  installation?: { id: number };
  head_commit?: { timestamp: string } | null;
  commits?: { added: string[]; modified: string[]; removed: string[] }[];
};

type InstallationEvent = { action: string; installation: { id: number } };

async function onPush(push: Push, appId: string, privateKey: string) {
  const admin = createAdminClient();
  const { data: projects } = await admin
    .from("projects")
    .select("id")
    .eq("github_id", push.repository.id);
  if (!projects?.length) return;

  const ids = projects.map((p) => p.id);
  if (push.head_commit?.timestamp)
    await admin
      .from("projects")
      .update({ last_commit_at: push.head_commit.timestamp })
      .in("id", ids);

  const paths = (push.commits ?? []).flatMap((c) => [...c.added, ...c.modified, ...c.removed]);
  if (!push.installation || !affectsScan(paths)) return;
  const token = await installationToken(appJwt(appId, privateKey), push.installation.id);
  const scan = await scanRepo(push.repository.full_name, token);
  await admin.from("projects").update({ scan, scanned_at: new Date().toISOString() }).in("id", ids);
}

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  const config = githubAppConfig();
  if (!secret || !config) return new NextResponse(null, { status: 503 });

  const body = await request.text();
  if (!validSignature(body, request.headers.get("x-hub-signature-256"), secret))
    return new NextResponse(null, { status: 401 });

  const event = request.headers.get("x-github-event");
  if (event === "push") {
    const push = JSON.parse(body) as Push;
    after(() => onPush(push, config.appId, config.privateKey).catch(console.error));
  } else if (event === "installation") {
    const { action, installation } = JSON.parse(body) as InstallationEvent;
    if (action === "deleted")
      await createAdminClient()
        .from("github_installations")
        .delete()
        .eq("installation_id", installation.id);
  }
  return new NextResponse(null, { status: 202 });
}
