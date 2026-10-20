"use client";

import { useActionState } from "react";
import type { FormState } from "../actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const idle: FormState = { status: "idle" };

// A one-button form for a team server action. Hidden fields carry the ids; errors show
// under the button. `confirm` asks before running, for actions that are hard to undo.
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  confirm,
  variant = "primary",
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "primary" | "ghost" | "link";
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const style = {
    primary: "btn disabled:opacity-50",
    ghost: "btn btn-ghost disabled:opacity-50",
    link: "text-sm text-fg-muted underline disabled:opacity-50",
  }[variant];

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="inline-block"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={style}>
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {state.status === "error" && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
