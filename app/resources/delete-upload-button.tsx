"use client";

import { useState, useTransition } from "react";
import { deleteMediaUpload } from "./media-actions";

// Delete one of your own uploads, after a confirm. The file goes to the organizers' Drive trash.
export function DeleteUploadButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        aria-label={`Delete ${name}`}
        onClick={() => {
          if (!window.confirm(`Delete ${name}? It's removed from the organizers' folder.`)) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteMediaUpload(id);
            if (!result.ok) setError(result.message);
          });
        }}
        className="rounded border border-line px-2 py-0.5 text-xs text-fg-muted hover:border-line-strong hover:text-fg disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    </span>
  );
}
