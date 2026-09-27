/** GET /connect/supabase/callback — verifies state, trades the code for a token, and moves on to the picker. */
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { seal, unseal } from "@/lib/sealed";
import { siteUrl } from "@/lib/site-url";
import {
  type ActiveConnect,
  CONNECT_COOKIE,
  CONNECT_PATH,
  connectConfig,
  cookieOptions,
  type PendingConnect,
} from "@/lib/supabase-connect";
import { exchangeCode } from "@/lib/supabase-mgmt";

export async function GET(request: NextRequest) {
  const config = connectConfig();
  const jar = await cookies();
  const pending = config
    ? unseal<PendingConnect>(jar.get(CONNECT_COOKIE)?.value, config.clientSecret)
    : null;
  const params = request.nextUrl.searchParams;
  const fail = (message: string) =>
    NextResponse.redirect(
      pending
        ? `${siteUrl()}/projects/${pending.projectId}?add=supabase&error=${encodeURIComponent(message)}#add`
        : `${siteUrl()}/dashboard`,
    );

  if (!config || !pending) return fail("That Supabase sign-in expired. Start again.");
  if (params.get("error")) return fail("Supabase access was not granted.");
  if (!params.get("state") || params.get("state") !== pending.state)
    return fail("That sign-in did not match. Start again.");

  try {
    const { accessToken, refreshToken } = await exchangeCode({
      code: params.get("code") ?? "",
      verifier: pending.verifier,
      redirectUri: config.redirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    const active: ActiveConnect = {
      token: accessToken,
      refresh: refreshToken,
      projectId: pending.projectId,
      userId: pending.userId,
    };
    jar.set(CONNECT_COOKIE, seal(active, config.clientSecret), cookieOptions);
    return NextResponse.redirect(`${siteUrl()}${CONNECT_PATH}?project=${pending.projectId}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Supabase sign-in failed.");
  }
}
