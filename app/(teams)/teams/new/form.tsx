"use client";

import { useActionState } from "react";
import { createTeam, type FormState } from "../actions";

const input = "w-full rounded border border-line-strong bg-bg-raised px-3 py-2";
const idle: FormState = { status: "idle" };

export function CreateTeamForm() {
  const [state, formAction, pending] = useActionState(createTeam, idle);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Team name</span>
        <input name="name" required minLength={2} maxLength={60} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Concept</span>
        <span className="block text-sm text-fg-muted">
          One paragraph: what you want to build and for which kind of small business. It&apos;s public, and it seeds your
          submission later.
        </span>
        <textarea name="concept" rows={5} maxLength={1000} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Who you&apos;re looking for</span>
        <span className="block text-sm text-fg-muted">For example: a restaurant owner and someone who knows Python.</span>
        <input name="looking_for" maxLength={300} className={input} />
      </label>
      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn disabled:opacity-50">
        {pending ? "Creating…" : "Create team"}
      </button>
    </form>
  );
}
