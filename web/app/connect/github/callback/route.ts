/**
 * GET /connect/github/callback — GitHub's setup URL after installing the app. Verifies the
 * state, asks GitHub who the signed-in user is, and stores the installation only if it is
 * their own account or an organisation they own.
 */
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { githubToken } from "@/lib/github";
import {
  appJwt,
  getInstallation,
  githubUser,
  installationToken,
  mayAttach,
  orgRole,
} from "@/lib/github-app";
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
  const jwt = appJwt(config.appId, config.privateKey);
  const [installation, user] = await Promise.all([
    getInstallation(jwt, installationId),
    githubToken(pending.userId)
      .then((t) => githubUser(t))
      .catch(() => null),
  ]);
  if (!installation) return back("GitHub does not know that installation.");
  if (!user) return back("Sign out and sign in with GitHub again, then retry.");
  const role =
    installation.accountType === "Organization"
      ? await installationToken(jwt, installation.id)
          .then((t) => orgRole(t, installation.account, user.login))
          .catch(() => "none" as const)
      : null;
  const verdict = mayAttach(installation, user, role);
  if (!verdict.ok) return back(verdict.reason);

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
