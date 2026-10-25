"use client";

import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { sendFeedback, type FeedbackState } from "./feedback-actions";

const KINDS = [
  { value: "bug", label: "Bug" },
  { value: "broken", label: "Not working" },
  { value: "question", label: "Question" },
  { value: "other", label: "Other" },
];

// A "/feedback" button fixed to the bottom right, like the title bar's slash commands. The form
// posts to Slack (lib/feedback.ts) with the page it was sent from. Closes on Escape.
export function FeedbackButton({ maxLength }: { maxLength: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [state, formAction, pending] = useActionState<FeedbackState, FormData>(sendFeedback, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);

  // Clear the form after a send, so a second message starts fresh.
  useEffect(() => {
    if (state.status === "ok") form.current?.reset();
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      {open && (
        <form
          ref={form}
          id="feedback-form"
          action={formAction}
          className="w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-lg border border-line bg-bg-raised p-4 text-sm shadow-lg"
        >
          <p className="font-medium text-fg">Bug, something not working, or a question? It goes straight to the organizers.</p>
          <input type="hidden" name="page" value={pathname} />
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">What is this about?</legend>
            {KINDS.map((kind, i) => (
              <label key={kind.value} className="flex items-center gap-1.5 rounded border border-line px-2 py-1 has-[:checked]:border-accent">
                <input type="radio" name="kind" value={kind.value} defaultChecked={i === 0} className="accent-[var(--accent)]" />
                {kind.label}
              </label>
            ))}
          </fieldset>
          <textarea
            name="text"
            required
            rows={4}
            maxLength={maxLength}
            placeholder="What happened, or what do you need?"
            className="w-full rounded border border-line-strong bg-bg px-2 py-1.5 text-fg"
          />
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-fg-muted hover:bg-fg/5">
              Close
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-foreground px-3 py-1.5 text-background disabled:cursor-wait disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
          {state.message && (
            <p className={state.status === "error" ? "text-red-600" : "text-live"} role="status">
              {state.message}
            </p>
          )}
        </form>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="feedback-form"
        className={`rounded border border-line-strong bg-bg-raised px-2 py-1 text-sm text-fg shadow-sm hover:bg-fg/5 ${open ? "bg-fg/5" : ""}`}
      >
        <span className="text-accent">/</span>feedback
      </button>
    </div>
  );
}
