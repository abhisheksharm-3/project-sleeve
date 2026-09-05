import { type NextRequest, NextResponse } from "next/server";
import { safeRedirect, siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth landing point. Exchanges the code for a session, then keeps the GitHub token.
 *
 * That second step is not optional: Supabase hands back `provider_token` exactly once, on
 * this exchange, and never persists it. Without capturing it here, listing a user's repos
 * later would mean bouncing them through GitHub again. It goes into github_credentials,
 * which has RLS on and no policies, so only the service role can ever read it back.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Configured origin, not the request's: see lib/site-url.ts. `next` is caller-supplied,
  // so it is resolved against that origin and rejected if it lands anywhere else —
  // an open redirect on the hop straight after sign-in is a phishing gift.
  const origin = siteUrl();
  const destination = safeRedirect(searchParams.get("next"), origin);

  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "sign_in_failed")}`,
    );
  }

  const providerToken = data.session?.provider_token;
  if (providerToken) {
    const admin = createAdminClient();
    const { error: tokenError } = await admin.from("github_credentials").upsert({
      user_id: data.user.id,
      access_token: providerToken,
      updated_at: new Date().toISOString(),
    });
    // Sign-in still succeeded; only repo import is degraded, and it can re-prompt.
    if (tokenError) console.error(`storing github token failed: ${tokenError.message}`);
  }

  return NextResponse.redirect(destination);
}
