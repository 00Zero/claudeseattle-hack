"use client";

import { useActionState, useEffect, useState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

type Sent = Extract<LoginState, { status: "sent" }>;

// "5:41 PM" in the viewer's time zone.
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Seconds until the given time, ticking every second; 0 once it has passed.
function useSecondsUntil(iso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
}

function CheckYourEmail({ state, formAction, pending }: { state: Sent; formAction: (data: FormData) => void; pending: boolean }) {
  const waitLeft = useSecondsUntil(state.resendAt);
  const waitMinutes = Math.round((Date.parse(state.resendAt) - Date.parse(state.sentAt)) / 60_000);
  const sentAt = clock(state.sentAt);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Check your email</h2>
      {state.alreadySent ? (
        <p>
          We already sent a sign-in link to <strong>{state.shownAddress}</strong> at {sentAt}, so we didn&apos;t send
          another. Use the link in that email.
        </p>
      ) : state.redirectedFrom === "linked" ? (
        <p>
          That address is linked to your account, so we sent the sign-in link to your account email,{" "}
          <strong>{state.shownAddress}</strong>, at {sentAt}.
        </p>
      ) : state.redirectedFrom === "luma" ? (
        <p>
          That&apos;s the Claude account email on your Luma registration, so we sent the sign-in link to the email
          you registered with, <strong>{state.shownAddress}</strong>, at {sentAt}.
        </p>
      ) : (
        <p>
          We sent a sign-in link to <strong>{state.shownAddress}</strong> at {sentAt}.
        </p>
      )}
      <p className="text-sm text-foreground/70">
        It usually arrives within a minute but can take up to {waitMinutes} minutes. Look for an email from Claude
        Seattle, and check your spam or promotions folder too. The link works once, in whichever browser you open it.
      </p>
      <p className="text-sm text-foreground/70">
        Please don&apos;t request another link while you wait: a new link cancels this one.
      </p>
      {state.directEmail && (
        <form action={formAction}>
          <input type="hidden" name="email" value={state.directEmail} />
          <input type="hidden" name="direct" value="1" />
          <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
            Can&apos;t get to that inbox? Send it to {state.directEmail} instead
          </button>
        </form>
      )}
      <form action={formAction} className="space-y-1">
        <input type="hidden" name="email" value={state.resend.email} />
        {state.resend.direct && <input type="hidden" name="direct" value="1" />}
        <button
          type="submit"
          disabled={pending || waitLeft > 0}
          className="rounded border border-foreground/20 px-3 py-2 text-sm disabled:opacity-50"
        >
          {pending
            ? "Sending…"
            : waitLeft > 0
              ? `Send a new link in ${Math.floor(waitLeft / 60)}:${String(waitLeft % 60).padStart(2, "0")}`
              : "Send a new link"}
        </button>
        {waitLeft === 0 && <p className="text-xs text-foreground/70">This cancels the link we sent at {sentAt}.</p>}
      </form>
      <p className="text-sm">
        <a href="/login" className="underline">
          Use a different email
        </a>
      </p>
    </div>
  );
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    // Keyed so a newly sent link restarts the countdown.
    return <CheckYourEmail key={state.sentAt} state={state} formAction={formAction} pending={pending} />;
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
        Use the email you registered with on Luma. Your Claude account email works too.
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
