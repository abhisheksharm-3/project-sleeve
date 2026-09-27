"use client";
/** The create form, which shows a new token in place, once, so it never lands in a URL. */
import { useActionState } from "react";
import { type CreateState, createApiToken } from "./actions";

export function CreateToken() {
  const [state, action, pending] = useActionState<CreateState, FormData>(createApiToken, {});
  return (
    <div className="mt-10">
      <form action={action} className="flex max-w-xl gap-3">
        <label htmlFor="token-name" className="sr-only">
          Token name
        </label>
        <input
          id="token-name"
          name="name"
          required
          maxLength={60}
          placeholder="GitHub Actions"
          className="flex-1 rounded-xl border border-line bg-ink px-4 py-2.5 text-[15px] placeholder:text-muted/50 focus:border-alive/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-alive px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-warn disabled:opacity-50"
        >
          Create token
        </button>
      </form>
      {state.error && (
        <p role="alert" className="mt-4 text-[15px] text-dead">
          {state.error}
        </p>
      )}
      {state.token && (
        <div role="status" className="mt-6 rounded-2xl border border-alive/40 bg-alive/5 p-5">
          <p className="text-[15px] font-semibold">Copy it now. It will not be shown again.</p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-ink p-3 font-mono text-[13px] select-all">
            {state.token}
          </pre>
        </div>
      )}
    </div>
  );
}
