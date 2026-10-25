"use client";

import { useId, useState } from "react";

// An info icon next to an error: hovering or focusing it shows what happened and what to do. Phones
// have no hover, so a tap toggles it too. It opens upward and to the right, since it sits at the
// start of a message, often in the save bar at the bottom of the screen.
export function ErrorInfo({ details }: { details?: string[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!details?.length) return null;
  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        aria-label="What happened and what to do"
        aria-describedby={id}
        aria-expanded={open}
        className="peer inline-flex h-5 w-5 items-center justify-center rounded-full text-red-600 hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.25v3a.75.75 0 001.5 0v-3.75A.75.75 0 0010 9H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <span
        role="tooltip"
        id={id}
        className={`absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded border border-line-strong bg-bg-raised p-3 text-left text-sm font-normal text-fg shadow-lg peer-hover:block peer-focus-visible:block ${open ? "block" : "hidden"}`}
      >
        {details.map((detail, i) => (
          <span key={i} className="block">
            {detail}
          </span>
        ))}
      </span>
    </span>
  );
}

// An error message with its info icon first, so the explanation opens over the page, not off it.
export function ErrorMessage({ message, details }: { message: string; details?: string[] }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-red-600" role="alert">
      <ErrorInfo details={details} />
      <span>{message}</span>
    </p>
  );
}
