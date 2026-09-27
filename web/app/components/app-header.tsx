/** The signed-in header on every page: sections and the account menu. */
import Link from "next/link";
import { signOut } from "@/app/account-actions";
import { isAdmin } from "@/lib/admin";
import type { requireUser } from "@/lib/session";
import { type NavItem, NavLinks } from "./nav-links";
import { Window } from "./window";

type Session = Awaited<ReturnType<typeof requireUser>>;

export async function AppHeader({ session }: { session: Session }) {
  const { supabase, user } = session;
  const { data: profile } = await supabase
    .from("profiles")
    .select("github_username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const name = profile?.github_username ?? "Your account";
  const items: NavItem[] = [
    { href: "/dashboard", label: "Projects", match: ["/dashboard", "/projects", "/import"] },
    { href: "/status-pages", label: "Status pages", match: ["/status-pages"] },
    ...(isAdmin(user.id)
      ? [{ href: "/insights", label: "Platform benchmarks", match: ["/insights"] }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-20 mb-6 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="flex h-14 items-stretch gap-8 px-6 sm:px-10 lg:px-16">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
          <Window state="alive" size="sm" />
          <span className="text-[15px] font-semibold tracking-tight max-sm:sr-only">
            ProjectSleeve
          </span>
        </Link>
        <NavLinks items={items} />
        <div className="ml-auto flex shrink-0 items-center gap-4">
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center rounded-full ring-offset-2 ring-offset-ink focus-visible:ring-2 focus-visible:ring-alive [&::-webkit-details-marker]:hidden">
              {profile?.avatar_url ? (
                // biome-ignore lint/performance/noImgElement: a 28px GitHub avatar needs no image optimiser or remote-host config.
                <img
                  src={profile.avatar_url}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 rounded-full border border-line"
                />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-xs font-semibold uppercase">
                  {name[0]}
                </span>
              )}
              <span className="sr-only">Account menu for {name}</span>
            </summary>
            <div className="absolute right-0 mt-3 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-2xl shadow-black">
              <p className="px-3 pt-2 pb-2.5 text-sm">
                <span className="block text-muted">Signed in as</span>
                <span className="block truncate font-semibold">{name}</span>
              </p>
              <div className="border-t border-line pt-1.5">
                <Link
                  href="/notifications"
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-raised"
                >
                  Notifications
                </Link>
                <Link
                  href="/api-tokens"
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-raised"
                >
                  API tokens
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-raised hover:text-dead"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
