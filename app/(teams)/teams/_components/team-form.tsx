"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "../actions";

const input = "w-full rounded border border-line-strong bg-bg-raised px-3 py-2";
const idle: FormState = { status: "idle" };

export type TeamValues = { name: string; concept: string | null; looking_for: string | null };

// Create and edit share this form. Hidden fields (the team id when editing) ride along.
export function TeamForm({
  action,
  values,
  fields = {},
  submitLabel,
  pendingLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  values?: TeamValues;
  fields?: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);

  return (
    <form
      // Submit by hand so a failed save keeps what was typed (React resets forms after an action).
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Team name</span>
        <input name="name" required minLength={2} maxLength={60} defaultValue={values?.name} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Concept</span>
        <span className="block text-sm text-fg-muted">
          One paragraph: what you want to build and for which kind of small business. It&apos;s public, and it seeds your
          submission later.
        </span>
        <textarea name="concept" rows={5} maxLength={1000} defaultValue={values?.concept ?? ""} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Who you&apos;re looking for</span>
        <span className="block text-sm text-fg-muted">For example: a restaurant owner and someone who knows Python.</span>
        <input name="looking_for" maxLength={300} defaultValue={values?.looking_for ?? ""} className={input} />
      </label>
      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn disabled:opacity-50">
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
