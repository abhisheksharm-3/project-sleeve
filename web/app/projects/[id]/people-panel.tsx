/**
 * Who can see this project. The owner sees members and invites more; a member sees who
 * shared it and can leave. Names come from profiles, read with the service role, since a
 * person's own profile is all RLS lets them read.
 */
import { leaveProject, removeMember } from "@/app/projects/team-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteButton } from "./invite-button";

export async function PeoplePanel({
  projectId,
  ownerId,
  viewerId,
}: {
  projectId: string;
  ownerId: string;
  viewerId: string;
}) {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("project_members")
    .select("user_id, created_at")
    .eq("project_id", projectId)
    .order("created_at");
  const ids = [ownerId, ...(members ?? []).map((m) => m.user_id)];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, github_username")
    .in("id", ids);
  const name = (id: string) => profiles?.find((p) => p.id === id)?.github_username ?? "Someone";
  const isOwner = viewerId === ownerId;

  return (
    <section id="people" className="mt-16 scroll-mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">People</h2>
        {!isOwner && (
          <form action={leaveProject}>
            <input type="hidden" name="project_id" value={projectId} />
            <button
              type="submit"
              className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-dead"
            >
              Leave this project
            </button>
          </form>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-[15px] text-muted">
        {isOwner
          ? "People you share this with see its backends and history, get its alerts and Monday digest, and can run checks and maintenance. Only you change what is kept awake."
          : `${name(ownerId)} shared this with you. You get its alerts and can run checks and maintenance; ${name(ownerId)} decides what is kept awake.`}
      </p>
      <ul className="mt-5 border-t border-line">
        <li className="flex items-center justify-between border-b border-line py-3 text-[15px]">
          <span className="font-medium">{name(ownerId)}</span>
          <span className="text-sm text-muted">Owner</span>
        </li>
        {(members ?? []).map((m) => (
          <li
            key={m.user_id}
            className="flex items-center justify-between gap-4 border-b border-line py-3 text-[15px]"
          >
            <span>{name(m.user_id)}</span>
            {isOwner ? (
              <form action={removeMember}>
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="user_id" value={m.user_id} />
                <button type="submit" className="text-sm text-muted hover:text-dead">
                  Remove
                </button>
              </form>
            ) : (
              <span className="text-sm text-muted">
                {m.user_id === viewerId ? "You" : "Member"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <div className="mt-5">
          <InviteButton projectId={projectId} />
        </div>
      )}
    </section>
  );
}
