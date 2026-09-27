"use client";
/** Makes an invite link and shows it in place, once, so it never lands in a URL. */
import { useActionState } from "react";
import { createInvite, type InviteState } from "@/app/projects/team-actions";

export function InviteButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, {});
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="project_id" value={projectId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-line px-4 py-2 text-sm transition-colors hover:border-alive/60 hover:text-alive disabled:opacity-50"
        >
          Make an invite link
        </button>
      </form>
      {state.error && (
        <p role="alert" className="mt-3 text-sm text-dead">
          {state.error}
        </p>
      )}
      {state.link && (
        <div role="status" className="mt-4 max-w-2xl">
          <p className="text-sm text-muted">
            Send this to one person. It works once, for 7 days, and they sign in with GitHub to
            join.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-ink p-3 font-mono text-[13px] select-all">
            {state.link}
          </pre>
        </div>
      )}
    </div>
  );
}
