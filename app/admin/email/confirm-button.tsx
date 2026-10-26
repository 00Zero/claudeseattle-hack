"use client";

import { useFormStatus } from "react-dom";

// A submit button that asks first. For sends that can't be taken back.
export function ConfirmButton({ children, confirm, pendingText, className, disabled }: { children: React.ReactNode; confirm: string; pendingText: string; className: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
      className={`${className} disabled:opacity-40 ${pending ? "cursor-wait" : "disabled:cursor-not-allowed"}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
