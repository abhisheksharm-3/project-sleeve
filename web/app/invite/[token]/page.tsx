import { AppHeader } from "@/app/components/app-header";
import { acceptInvite } from "@/app/projects/team-actions";
import { hashToken } from "@/lib/api-token";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** An invite link, opened by someone signed in: who is sharing what, and a button to join. */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const session = await requireUser();
  const { token } = await params;
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("project_invites")
    .select("expires_at, projects (name, user_id)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const project = invite?.projects as unknown as { name: string; user_id: string } | null;
  const valid = !!invite && !!project && Date.parse(invite.expires_at) > Date.now();
  const { data: owner } = valid
    ? await admin.from("profiles").select("github_username").eq("id", project.user_id).maybeSingle()
    : { data: null };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader session={session} />
      <main className="w-full max-w-2xl flex-1 px-6 pt-10 pb-20 sm:px-10 lg:px-16">
        {valid ? (
          <>
            <h1 className="text-4xl font-semibold">Join {project.name.split("/").pop()}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {owner?.github_username ?? "Someone"} is sharing this project with you. You will see
              its backends and their history, get its alerts and Monday digest, and be able to run
              checks and maintenance.
            </p>
            <form action={acceptInvite} className="mt-8">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-full bg-alive px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-warn"
              >
                Join the project
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-semibold">This invite has expired</h1>
            <p className="mt-3 text-[15px] text-muted">
              Invite links work once, for 7 days. Ask the project&apos;s owner for a new one.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
