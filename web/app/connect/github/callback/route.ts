/**
 * GET /connect/github/callback — GitHub's setup URL after installing the app. Verifies the
 * state, then that the installation is on the user's own account, before storing it.
 *
 * ponytail: organisation installations are refused, because membership alone does not prove
 * the user can see every repository the installation grants. Add them with a user-to-server
 * token and GET /user/installations when someone needs orgs.
 */
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { appJwt, getInstallation } from "@/lib/github-app";
import { githubAppConfig, INSTALL_COOKIE } from "@/lib/github-app-config";
import { unseal } from "@/lib/sealed";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const config = githubAppConfig();
  const params = request.nextUrl.searchParams;
  const back = (message?: string) =>
    NextResponse.redirect(
      `${siteUrl()}/import${message ? `?error=${encodeURIComponent(message)}` : "?private=1"}`,
    );
  if (!config) return back("Private repository access is not set up yet.");

  const pending = unseal<{ state: string; userId: string }>(
    (await cookies()).get(INSTALL_COOKIE)?.value,
    config.privateKey,
  );
  if (!pending || params.get("state") !== pending.state)
    return back("That GitHub install did not match. Start again from this page.");
  const installationId = Number(params.get("installation_id"));
  if (!Number.isSafeInteger(installationId) || installationId <= 0)
    return back("GitHub did not say which installation this was.");

  const admin = createAdminClient();
  const [installation, { data: profile }] = await Promise.all([
    getInstallation(appJwt(config.appId, config.privateKey), installationId),
    admin.from("profiles").select("github_username").eq("id", pending.userId).maybeSingle(),
  ]);
  if (!installation) return back("GitHub does not know that installation.");
  if (installation.account.toLowerCase() !== profile?.github_username?.toLowerCase()) {
    return back(
      `That app was installed on ${installation.account}. Install it on your own account, ${profile?.github_username ?? "the one you signed in with"}.`,
    );
  }

  await admin.from("github_installations").upsert(
    {
      user_id: pending.userId,
      installation_id: installation.id,
      account_login: installation.account,
    },
    { onConflict: "user_id,installation_id" },
  );
  (await cookies()).delete({ name: INSTALL_COOKIE, path: "/connect/github" });
  return back();
}
