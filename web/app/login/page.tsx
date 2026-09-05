import { redirect } from "next/navigation";
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
    <main className="flex-1 grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-10">
          <span className="pulse size-2 rounded-full bg-alive" aria-hidden />
          <span className="font-mono text-sm tracking-tight">projectsleeve</span>
        </div>

        <h1 className="text-2xl font-medium mb-3">Your side projects stop pausing.</h1>
        <p className="text-muted text-sm leading-relaxed mb-8">
          Free-tier backends sleep after a week of quiet. ProjectSleeve pings them in a way that
          resets the clock that actually matters, on a schedule that cannot switch itself off.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-6 border border-dead/40 bg-dead/10 px-3 py-2 font-mono text-xs text-dead"
          >
            {error}
          </p>
        )}

        <form action={signInWithGitHub}>
          <button
            type="submit"
            className="w-full border border-line bg-surface px-4 py-2.5 text-sm font-medium
                       hover:bg-raised hover:border-muted/40 transition-colors"
          >
            Continue with GitHub
          </button>
        </form>

        <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
          read:user only. We never ask for access to your code.
        </p>
      </div>
    </main>
  );
}
