/** The signed-in header on every page: home, admin benchmarks, account. */
import Link from "next/link";
import { signOut } from "@/app/account-actions";
import { isAdmin } from "@/lib/admin";
import type { requireUser } from "@/lib/session";
import { Window } from "./window";

type Session = Awaited<ReturnType<typeof requireUser>>;

export async function AppHeader({ session }: { session: Session }) {
  const { supabase, user } = session;
  const { data: profile } = await supabase
    .from("profiles")
    .select("github_username")
    .eq("id", user.id)
    .maybeSingle();
  const link = "text-sm text-muted transition-colors hover:text-text";

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-5 sm:px-10 lg:px-16">
      <Link href="/dashboard" className="flex items-center gap-2.5">
        <Window state="alive" size="sm" />
        <span className="text-[15px] font-semibold tracking-tight">ProjectSleeve</span>
      </Link>
      <nav className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/dashboard" className={link}>
          Projects
        </Link>
        {isAdmin(user.id) && (
          <Link href="/insights" className={link}>
            Platform benchmarks
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className={link}>
            Sign out{profile?.github_username ? ` ${profile.github_username}` : ""}
          </button>
        </form>
      </nav>
    </header>
  );
}
