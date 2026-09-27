/** GET /connect/supabase/start?project=… — begins the Supabase OAuth flow with PKCE and a state check. */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { challengeFor, newVerifier } from "@/lib/pkce";
import { seal } from "@/lib/sealed";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import {
  CONNECT_COOKIE,
  connectConfig,
  cookieOptions,
  type PendingConnect,
} from "@/lib/supabase-connect";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project") ?? "";
  const back = `${siteUrl()}/projects/${projectId}`;
  const config = connectConfig();
  if (!config)
    return NextResponse.redirect(
      `${back}?add=supabase&error=${encodeURIComponent("One-click Supabase setup is not configured.")}#add`,
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login`);
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.redirect(`${siteUrl()}/dashboard`);

  const pending: PendingConnect = {
    verifier: newVerifier(),
    state: randomBytes(24).toString("base64url"),
    projectId,
    userId: user.id,
  };
  (await cookies()).set(CONNECT_COOKIE, seal(pending, config.clientSecret), cookieOptions);

  const authorize = new URL("https://api.supabase.com/v1/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state: pending.state,
    code_challenge: challengeFor(pending.verifier),
    code_challenge_method: "S256",
  }).toString();
  return NextResponse.redirect(authorize.toString());
}
