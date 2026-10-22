"use client";

import { useActionState } from "react";
import type { FormState } from "../actions";

const idle: FormState = { status: "idle" };

export type Option = { value: string; label: string; disabled?: boolean };

// A dropdown plus a button for a team server action: "Move to [team] →", "Add [person]".
export function SelectAction({
  action,
  fields,
  name,
  options,
  placeholder,
  label,
  pendingLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  name: string;
  options: Option[];
  placeholder: string;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="space-y-1">
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <select
          name={name}
          defaultValue=""
          aria-label={placeholder}
          className="min-w-0 max-w-full flex-1 rounded border border-line-strong bg-bg-raised px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn btn-ghost shrink-0 disabled:opacity-50">
          {pending ? pendingLabel : label}
        </button>
      </div>
      {state.status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
