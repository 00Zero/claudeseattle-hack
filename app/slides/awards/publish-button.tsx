"use client";

import { useState, useTransition } from "react";
import { publishResults } from "./actions";

// One click puts the finalists (or winners) on /results. Disabled with a reason in rehearsal
// mode or before there's anything to publish.
export function PublishButton({ field, published, disabledReason, label }: { field: "publish_finalists" | "publish_winners"; published: boolean; disabledReason?: string; label: string }) {
  const [done, setDone] = useState(published);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="flex items-center gap-3 font-mono text-[22px] text-fg-muted">
        <span className="text-[#2e7d4f]">✓</span> Published: live on hack.claudeseattle.org/results
      </p>
    );
  }
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
        className="rounded-full bg-accent px-7 py-4 text-[22px] font-semibold text-accent-fg transition-transform hover:-translate-y-px disabled:opacity-40"
      >
        {pending ? "Publishing…" : label}
      </button>
      {(disabledReason || error) && <span className="text-[19px] text-fg-muted">{error ?? disabledReason}</span>}
    </div>
  );
}
