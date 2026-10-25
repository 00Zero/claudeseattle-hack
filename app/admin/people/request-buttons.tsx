"use client";

import { useActionState } from "react";
import { decideLoginRequest, type RequestDecisionState } from "./actions";

const small = "rounded border border-foreground/20 px-2 py-0.5 text-xs enabled:hover:bg-foreground/5 disabled:opacity-40";

// Approve (creates or switches the account and emails a sign-in link) or decline one sign-in request.
export function RequestButtons({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<RequestDecisionState, FormData>(decideLoginRequest, {
    status: "idle",
  });

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="email" value={email} />
      <button type="submit" name="decision" value="approve" disabled={pending} className={small}>
        {pending ? "Working…" : "Approve and send link"}
      </button>
      <button type="submit" name="decision" value="decline" disabled={pending} className={small}>
        Decline
      </button>
      {state.message && (
        <span className={`w-full text-xs ${state.status === "error" ? "text-red-600" : "text-foreground/70"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
