"use client";

import { startTransition, useActionState, useState } from "react";
import { anchorFor, fieldName, formatScore, mean, SCORE_MAX, SCORE_MIN, type Criterion } from "../../_lib/scoring";
import type { ScoreState } from "../actions";

const idle: ScoreState = { status: "idle" };
const VALUES = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);

// Each anchor pair has a colour, low to high: red 1–2, orange 3–4, yellow 5–6, green 7–8. The
// border shows the band; the chosen score fills with it.
const BANDS = [
  "border-red-500 peer-checked:bg-red-500 peer-checked:text-white",
  "border-orange-500 peer-checked:bg-orange-500 peer-checked:text-white",
  "border-yellow-500 peer-checked:bg-yellow-400 peer-checked:text-black",
  "border-green-600 peer-checked:bg-green-600 peer-checked:text-white",
];
const band = (v: number) => BANDS[Math.min(BANDS.length - 1, Math.floor((v - SCORE_MIN) / 2))];

// The enabled criteria, each 1–8 with no middle, plus an optional comment. Built for a phone:
// big tap targets coloured red to green, the anchor for the chosen score shown under each row,
// the mean at the bottom.
// `initial` is my saved score by criterion key; criteria it doesn't cover start empty.
export function ScoreForm({
  action,
  entryId,
  round,
  criteria,
  initial,
}: {
  action: (prev: ScoreState, formData: FormData) => Promise<ScoreState>;
  entryId: string;
  round: "prelim" | "final";
  criteria: Criterion[];
  initial: { byKey: Record<string, number>; comment: string | null } | null;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [scores, setScores] = useState<(number | null)[]>(criteria.map((c) => initial?.byKey[c.key] ?? null));
  const complete = scores.every((s) => s !== null);
  const avg = complete ? mean(scores as number[]) : null;
  // My saved score used other criteria (the rubric changed in the test world): say so.
  const changed = initial !== null && (criteria.some((c) => !(c.key in initial.byKey)) || Object.keys(initial.byKey).length !== criteria.length);

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
      {changed && (
        <p className="rounded border border-accent bg-accent-soft px-3 py-2 text-sm" role="status">
          The criteria changed since you saved this score. Score every criterion below and save again.
        </p>
      )}
      <p className="flex justify-between font-mono text-xs text-fg-muted" aria-hidden="true">
        <span>Lowest score</span>
        <span>Highest score</span>
      </p>
      {criteria.map((criterion, i) => (
        <fieldset key={criterion.key} className="space-y-2">
          <legend className="font-display text-xl font-light">{criterion.name}</legend>
          {criterion.note && <p className="text-sm text-fg-muted">{criterion.note}</p>}
          <div className="grid grid-cols-8 gap-1">
            {VALUES.map((v) => (
              <label key={v} className="relative">
                <input
                  type="radio"
                  name={fieldName(criterion)}
                  value={v}
                  checked={scores[i] === v}
                  onChange={() => setScores(scores.map((s, j) => (j === i ? v : s)))}
                  className="peer sr-only"
                  required
                />
                <span
                  className={`flex h-11 items-center justify-center rounded border-2 text-base font-mono transition-colors hover:bg-fg/5 peer-focus-visible:ring-2 ${band(v)}`}
                >
                  {v}
                </span>
              </label>
            ))}
          </div>
          <p className="min-h-5 text-sm text-fg-muted">
            {scores[i] !== null ? anchorFor(criterion, scores[i]!) : ""}
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
