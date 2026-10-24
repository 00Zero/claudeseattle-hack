"use client";

import { useActionState, useState } from "react";
import type { FormState } from "../actions";
import { countWords, NOTE_MAX_WORDS } from "../_lib/notes";

const idle: FormState = { status: "idle" };

// Apply or invite with an optional note (at most 50 words). `collapsed` shows just the button
// until tapped, for lists of people; the team page's Apply shows the note box straight away.
export function NoteForm({
  action,
  fields,
  label,
  submitLabel = label,
  pendingLabel,
  placeholder,
  collapsed = false,
  variant = "primary",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  submitLabel?: string;
  pendingLabel: string;
  placeholder: string;
  collapsed?: boolean;
  variant?: "primary" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [open, setOpen] = useState(!collapsed);
  const [note, setNote] = useState("");
  const words = countWords(note);
  const tooLong = words > NOTE_MAX_WORDS;
  const buttonClass = variant === "primary" ? "btn disabled:opacity-50" : "btn btn-ghost disabled:opacity-50";

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Add a note (optional)</span>
        <textarea
          name="note"
          rows={3}
          maxLength={400}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-line-strong bg-bg-raised px-3 py-2 text-sm"
        />
        <span className={`block text-xs ${tooLong ? "text-red-600" : "text-fg-muted"}`} aria-live="polite">
          {words}/{NOTE_MAX_WORDS} words
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || tooLong} className={buttonClass}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {collapsed && (
          <button type="button" className="text-sm text-fg-muted underline" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
      </div>
      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
