"use client";

import { useActionState, useEffect, useState } from "react";
import { requestAccess, sendMagicLink, type LoginState, type RequestState } from "./actions";

type Sent = Extract<LoginState, { status: "sent" }>;
type NotSent = Extract<LoginState, { status: "not_sent" }>;

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

const startOver = (
  <p className="text-sm">
    <a href="/login" className="underline">
      Use a different email
    </a>
  </p>
);

function CheckYourEmail({ state, formAction, pending }: { state: Sent; formAction: (data: FormData) => void; pending: boolean }) {
  const waitLeft = useSecondsUntil(state.resendAt);
  const waitMinutes = Math.round((Date.parse(state.resendAt) - Date.parse(state.sentAt)) / 60_000);
  const sentAt = clock(state.sentAt);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Check your email</h2>
      {state.alreadySent ? (
        <p>
          We already sent a sign-in link to <strong>{state.address}</strong> at {sentAt}, so we didn&apos;t send
          another. Use the link in that email.
        </p>
      ) : (
        <p>
          We sent a sign-in link to <strong>{state.address}</strong> at {sentAt}.
        </p>
      )}
      <p className="text-sm text-foreground/70">
        It usually arrives within a minute but can take up to {waitMinutes} minutes. Look for an email from Claude
        Seattle, and check your spam or promotions folder too. The link works once, in whichever browser you open it.
      </p>
      <p className="text-sm text-foreground/70">
        Please don&apos;t request another link while you wait: a new link cancels this one.
      </p>
      <form action={formAction} className="space-y-1">
        <input type="hidden" name="email" value={state.address} />
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
      {startOver}
    </div>
  );
}

// Asks the organizers to let this email sign in. Nothing is emailed to it until they approve.
function RequestAccess({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<RequestState, FormData>(requestAccess, { status: "idle" });

  if (state.status === "requested") {
    return (
      <p className="rounded border border-foreground/15 p-3 text-sm">
        Request sent. An organizer will review it, and once they approve it we&apos;ll email a sign-in link to{" "}
        <strong>{state.email}</strong>. You don&apos;t need to do anything else until then.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded border border-foreground/15 p-3">
      <p className="text-sm font-medium">Can&apos;t use the email you registered with?</p>
      <p className="text-sm text-foreground/70">
        You can ask the organizers to let you sign in with <strong>{email}</strong> instead.
      </p>
      <input type="hidden" name="email" value={email} />
      <label className="block space-y-1">
        <span className="text-sm font-medium">Your name</span>
        <input
          name="name"
          required
          maxLength={200}
          autoComplete="name"
          className="w-full rounded border border-foreground/20 bg-background px-3 py-2"
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="ack" required className="mt-1" />
        <span>I understand I won&apos;t get a sign-in link until an organizer approves this request.</span>
      </label>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-foreground/20 px-3 py-2 text-sm disabled:opacity-50"
      >
        {pending ? "Sending request…" : `Request access for ${email}`}
      </button>
    </form>
  );
}

function NotSentNotice({ state }: { state: NotSent }) {
  const typed = <strong>{state.typed}</strong>;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">We didn&apos;t send a link</h2>
      {state.reason === "linked" && (
        <p>
          {typed} is linked to an account that signs in with <strong>{state.useInstead}</strong>. Log in with that
          email instead.
        </p>
      )}
      {state.reason === "claude" && (
        <p>
          {typed} is the Claude account email on your Luma registration. Log in with the email you registered with on
          Luma: <strong>{state.useInstead}</strong>.
        </p>
      )}
      {state.reason === "unregistered" && (
        <p>
          We couldn&apos;t find a Luma registration for {typed}. Log in with the email you used to register on Luma.
        </p>
      )}
      {state.reason === "requested" && (
        <p>
          Your request to sign in with {typed} is waiting for an organizer. Once they approve it, we&apos;ll email a
          sign-in link to that address.
        </p>
      )}
      {state.reason === "closed" && (
        <p>
          New accounts are closed now that the event is over. If you already have an account, log in with the email it uses.
        </p>
      )}
      {state.reason === "declined" && (
        <p>An organizer declined the request to sign in with {typed}. Please find an organizer at the event.</p>
      )}
      {(state.reason === "claude" || state.reason === "unregistered") && <RequestAccess email={state.typed} />}
      {startOver}
    </div>
  );
}

export function LoginForm({ next, defaultEmail }: { next?: string | null; defaultEmail?: string | null }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    // Keyed so a newly sent link restarts the countdown.
    return <CheckYourEmail key={state.sentAt} state={state} formAction={formAction} pending={pending} />;
  }
  if (state.status === "not_sent") return <NotSentNotice state={state} />;

  return (
    <form action={formAction} className="space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          defaultValue={defaultEmail ?? undefined}
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded border border-foreground/20 bg-background px-3 py-2"
        />
      </label>
      <p className="text-sm text-foreground/70">Use the email you registered with on Luma.</p>
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
