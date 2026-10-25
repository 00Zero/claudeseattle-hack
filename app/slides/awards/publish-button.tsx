"use client";

import { useState, useTransition } from "react";
import { publishResults } from "./actions";

// One click puts the finalists (or winners) on /results, and the button goes away; it doesn't show
// at all once they're published (here or on /admin/judging). Disabled with a reason in rehearsal
// mode or before there's anything to publish.
export function PublishButton({ field, published, disabledReason, label }: { field: "publish_finalists" | "publish_winners"; published: boolean; disabledReason?: string; label: string }) {
  const [done, setDone] = useState(published);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (published || done) return null;
  return (
    <div className="flex items-center gap-5" data-no-advance>
      <button
        type="button"
        disabled={Boolean(disabledReason) || pending}
        onClick={(event) => {
          event.currentTarget.blur();
          setError(null);
          startTransition(async () => {
            const result = await publishResults(field).catch((e: Error) => ({ ok: false as const, message: e.message }));
            if (result.ok) setDone(true);
            else setError(result.message);
          });
        }}
        className="shrink-0 whitespace-nowrap rounded-full bg-accent px-7 py-4 text-[22px] font-semibold text-accent-fg transition-transform hover:-translate-y-px disabled:opacity-40"
      >
        {pending ? "Publishing…" : label}
      </button>
      {(disabledReason || error) && <span className="max-w-[24ch] text-[19px] leading-snug text-fg-muted">{error ?? disabledReason}</span>}
    </div>
  );
}
