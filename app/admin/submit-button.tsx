"use client";

import { useFormStatus } from "react-dom";

// Submit button that shows it was clicked: disabled with "Saving…" (or the
// given text) while its form's server action runs.
export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-50`}>
      {pending ? pendingText : children}
    </button>
  );
}
