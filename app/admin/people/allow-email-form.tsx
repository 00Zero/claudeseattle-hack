"use client";

import { useActionState, useEffect, useRef } from "react";
import { allowEmail, type AllowState } from "./actions";

const input = "rounded border border-foreground/20 bg-background px-2 py-1.5 text-sm";

// Lets someone in by email without a sign-in request (allowEmail in ./actions). Clears after a success.
export function AllowEmailForm() {
  const [state, formAction, pending] = useActionState<AllowState, FormData>(allowEmail, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "ok") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="space-y-2 rounded border border-foreground/15 p-3">
      <div className="flex flex-wrap gap-2">
        <input name="first_name" required maxLength={100} placeholder="First name" aria-label="First name" className={input} />
        <input name="last_name" maxLength={100} placeholder="Last name" aria-label="Last name" className={input} />
        <input
          name="email"
          type="email"
          required
          placeholder="Email they'll sign in with"
          aria-label="Email"
          className={`${input} min-w-64 flex-1`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="send_link" defaultChecked />
          Email them a sign-in link now
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/5 disabled:cursor-wait disabled:opacity-50"
        >
          {pending ? "Allowing…" : "Allow"}
        </button>
      </div>
      {state.message && (
        <p className={`text-sm ${state.status === "error" ? "text-red-600" : "text-foreground/70"}`}>{state.message}</p>
      )}
    </form>
  );
}
