/** GET /connect/github/start — sends the user to install the GitHub App on the repositories they choose. */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { githubAppConfig, INSTALL_COOKIE, INSTALL_PATH } from "@/lib/github-app-config";
import { seal } from "@/lib/sealed";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const config = githubAppConfig();
  if (!config)
    return NextResponse.redirect(
      `${siteUrl()}/import?error=${encodeURIComponent("Private repository access is not set up yet.")}`,
    );
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login`);

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(INSTALL_COOKIE, seal({ state, userId: user.id }, config.privateKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: INSTALL_PATH,
    maxAge: 900,
  });
  return NextResponse.redirect(
    `https://github.com/apps/${config.slug}/installations/new?state=${state}`,
  );
}
