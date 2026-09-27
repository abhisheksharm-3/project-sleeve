import Link from "next/link";
import { redirect } from "next/navigation";
import { Skyline } from "@/app/components/skyline";
import { Window } from "@/app/components/window";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-in is a server action, so the page ships no client JavaScript at all.
 *
 * Scope is `read:user` only. Listing public repos needs nothing more, and asking for `repo`
 * at the door — read access to every private repository — is the kind of prompt that makes
 * a developer close the tab (spec §6).
 */
async function signInWithGitHub() {
  "use server";

  // The origin comes from configuration, never from request headers: a redirect_uri built
  // from an attacker-supplied Host would hand them the authorization code.
  const origin = siteUrl();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback`, scopes: "read:user" },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "sign_in_unavailable")}`);
  }
  redirect(data.url);
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-sky to-ink">
      <main className="grid flex-1 items-center gap-16 px-6 py-16 sm:px-10 lg:grid-cols-[28rem_minmax(0,1fr)] lg:px-16">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Window state="alive" size="sm" />
            <span className="text-[15px] font-semibold tracking-tight">ProjectSleeve</span>
          </Link>
          <h1 className="mt-12 text-4xl leading-tight font-semibold">
            Sign in and leave the lights to us.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            We import your repositories as projects. You tell us which backend each one depends on,
            and we keep it awake.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-dead/40 bg-dead/10 px-4 py-3 text-sm text-dead"
            >
              {error}
            </p>
          )}

          <form action={signInWithGitHub} className="mt-10">
            <button
              type="submit"
              className="w-full rounded-full bg-alive px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-warn"
            >
              Continue with GitHub
            </button>
          </form>
          <p className="mt-4 text-sm text-muted">
            We ask for your public profile only. We never read your code.
          </p>
        </div>
        <div className="hidden min-w-0 overflow-hidden border-b-2 border-line lg:block">
          <Skyline />
        </div>
      </main>
    </div>
  );
}
