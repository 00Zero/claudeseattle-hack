"use client";

import { useActionState } from "react";
import { SubmitButton } from "../submit-button";
import { testSignInLink, type LinkState } from "./actions";

// "Sign-in link" for a test account: shows a one-time link to open on another device.
export function SignInLink({ profileId, className }: { profileId: string; className: string }) {
  const [state, action] = useActionState<LinkState, FormData>(testSignInLink, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="profile_id" value={profileId} />
      <SubmitButton className={className} pendingText="Making…">
        Sign-in link
      </SubmitButton>
      {state.url && (
        <input
          readOnly
          value={state.url}
          onFocus={(e) => e.currentTarget.select()}
          className="block w-56 rounded border border-foreground/20 bg-background px-2 py-1 text-xs"
          aria-label="One-time sign-in link"
        />
      )}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
