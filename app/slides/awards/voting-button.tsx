"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAudienceVoting } from "./actions";

// Opens or closes audience voting, then re-reads the deck so the slide shows the new state.
export function VotingButton({ to, label, disabledReason }: { to: "open" | "closed"; label: string; disabledReason?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-5" data-no-advance>
      <button
        type="button"
        disabled={Boolean(disabledReason) || pending}
        onClick={(event) => {
          event.currentTarget.blur();
          setError(null);
          startTransition(async () => {
            const result = await setAudienceVoting(to).catch((e: Error) => ({ ok: false as const, message: e.message }));
            if (result.ok) router.refresh();
            else setError(result.message);
          });
        }}
        className={`rounded-full px-7 py-4 text-[22px] font-semibold transition-transform hover:-translate-y-px disabled:opacity-40 ${to === "open" ? "bg-accent text-accent-fg" : "border border-line-strong"}`}
      >
        {pending ? "Saving…" : label}
      </button>
      {(disabledReason || error) && <span className="text-[19px] text-fg-muted">{error ?? disabledReason}</span>}
    </div>
  );
}
