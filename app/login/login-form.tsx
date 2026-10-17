"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Check your email</h2>
        {state.redirected ? (
          <p>
            That address is linked to your account, so we sent the sign-in link to your account email,{" "}
            <strong>{state.shownAddress}</strong>.
          </p>
        ) : (
          <p>
            We sent a sign-in link to <strong>{state.shownAddress}</strong>.
          </p>
        )}
        <p className="text-sm text-foreground/70">The link works once. Open it in this browser.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded border border-foreground/20 bg-background px-3 py-2"
        />
      </label>
      <p className="text-sm text-foreground/70">
        Use the email you registered with on Luma, or your Claude account email.
      </p>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
