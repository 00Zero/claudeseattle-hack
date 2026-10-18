"use client";

import { useFormStatus } from "react-dom";

// Submit button that shows it was clicked: disabled with "Saving…" (or the
// given text) while its form's server action runs.
export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      title={title}
      className={`${className} disabled:opacity-40 ${pending ? "cursor-wait" : "disabled:cursor-not-allowed"}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
