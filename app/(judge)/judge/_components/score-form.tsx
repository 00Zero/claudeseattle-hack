"use client";

import { startTransition, useActionState, useState } from "react";
import { anchorFor, CRITERIA, formatScore, mean, SCORE_MAX, SCORE_MIN } from "../../_lib/scoring";
import type { ScoreState } from "../actions";

const idle: ScoreState = { status: "idle" };
const VALUES = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);

// Four criteria, each 1–8 with no middle, plus an optional comment. Built for a phone: big
// tap targets, the anchor for the chosen score shown under each row, the mean at the bottom.
export function ScoreForm({
  action,
  entryId,
  round,
  initial,
}: {
  action: (prev: ScoreState, formData: FormData) => Promise<ScoreState>;
  entryId: string;
  round: "prelim" | "final";
  initial: { scores: number[]; comment: string | null } | null;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [scores, setScores] = useState<(number | null)[]>(initial?.scores ?? CRITERIA.map(() => null));
  const complete = scores.every((s) => s !== null);
  const avg = complete ? mean(scores as number[]) : null;

  return (
    <form
      // Submit by hand so a failed save keeps the picks (React resets forms after an action).
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-5"
    >
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="round" value={round} />
      {CRITERIA.map((criterion, i) => (
        <fieldset key={criterion.name} className="space-y-2">
          <legend className="font-display text-xl font-light">{criterion.name}</legend>
          <div className="grid grid-cols-8 gap-1">
            {VALUES.map((v) => (
              <label key={v} className="relative">
                <input
                  type="radio"
                  name={`c${i}`}
                  value={v}
                  checked={scores[i] === v}
                  onChange={() => setScores(scores.map((s, j) => (j === i ? v : s)))}
                  className="peer sr-only"
                  required
                />
                <span className="flex h-11 items-center justify-center rounded border border-line-strong text-base font-mono transition-colors hover:border-accent peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:ring-2">
                  {v}
                </span>
              </label>
            ))}
          </div>
          <p className="min-h-5 text-sm text-fg-muted">
            {scores[i] !== null ? anchorFor(i, scores[i]!) : "Low end of a pair = weaker, high end = stronger."}
          </p>
        </fieldset>
      ))}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Comment (optional)</span>
        <textarea name="comment" rows={3} maxLength={2000} defaultValue={initial?.comment ?? ""} className="w-full rounded border border-line-strong bg-bg-raised px-3 py-2" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !complete} className="btn disabled:opacity-50">
          {pending ? "Saving…" : initial ? "Update score" : "Save score"}
        </button>
        <span className="flex items-baseline gap-2">
          <span className="eyebrow">Mean</span>
          <span className="font-display text-3xl font-light leading-none">{formatScore(avg)}</span>
        </span>
      </div>
      {state.message && (
        <p className={`text-sm ${state.status === "error" ? "text-red-600" : "text-fg-muted"}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
