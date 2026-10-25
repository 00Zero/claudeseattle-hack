"use client";

import { startTransition, useActionState, useState } from "react";
import { assignJudge, autoAssign, createFallbackEntry, generateNotes, setFinalist, setJudgingCriteria, type RowState } from "./actions";

const select = "rounded border border-foreground/20 bg-background text-xs disabled:opacity-60";
const button = "rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5 disabled:cursor-wait disabled:opacity-50";
const idle: RowState = { status: "idle" };

export type JudgeOption = { id: string; name: string; load: number };

// Judge dropdown for one entry. The option list shows each judge's current load.
export function JudgeForm({ entryId, judgeId, judges }: { entryId: string; judgeId: string | null; judges: JudgeOption[] }) {
  const [state, formAction, pending] = useActionState(assignJudge, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="entry_id" value={entryId} />
      <select key={judgeId ?? ""} name="judge_id" defaultValue={judgeId ?? ""} disabled={pending} className={select} aria-label="Judge">
        <option value="">No judge</option>
        {judges.map((j) => (
          <option key={j.id} value={j.id}>
            {j.name} ({j.load})
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving…" : "Set"}
      </button>
      {state.status === "error" && <span className="w-full text-xs text-red-600">{state.message}</span>}
    </form>
  );
}

// Finalist override: auto follows the prelim ranking; yes/no force it.
export function FinalistForm({ entryId, override, isFinalist }: { entryId: string; override: boolean | null; isFinalist: boolean }) {
  const [state, formAction, pending] = useActionState(setFinalist, idle);
  const value = override === null ? "auto" : override ? "yes" : "no";
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="entry_id" value={entryId} />
      <select key={value} name="finalist" defaultValue={value} disabled={pending} className={select} aria-label="Finalist">
        <option value="auto">Auto{override === null ? ` (${isFinalist ? "yes" : "no"})` : ""}</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving…" : "Set"}
      </button>
      {state.status === "error" && <span className="w-full text-xs text-red-600">{state.message}</span>}
    </form>
  );
}

const field = "w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm";

// Fallback entry for a team that isn't on the Teams app. Collapsed until needed.
export function FallbackEntryForm() {
  const [state, formAction, pending] = useActionState(createFallbackEntry, idle);
  return (
    <details className="rounded border border-foreground/15 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">Add an entry for a team that isn&apos;t on the Teams app</summary>
      <form
        // Submit by hand so a failed save keeps what was typed; the key change clears it after a success.
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
        key={state.status === "ok" ? state.message : "form"}
        className="mt-3 grid gap-3 text-sm sm:grid-cols-2"
      >
        <label className="space-y-1">
          <span className="font-medium">Team name</span>
          <input name="team_name" required minLength={2} maxLength={60} className={field} />
        </label>
        <label className="space-y-1">
          <span className="font-medium">Member emails</span>
          <input name="member_emails" required placeholder="Comma or space separated" className={field} />
        </label>
        <label className="space-y-1">
          <span className="font-medium">Project title</span>
          <input name="title" required maxLength={80} className={field} />
        </label>
        <label className="space-y-1">
          <span className="font-medium">Tagline</span>
          <input name="tagline" maxLength={140} className={field} />
        </label>
        <label className="space-y-1">
          <span className="font-medium">Demo video link</span>
          <input name="video_url" type="url" required className={field} />
        </label>
        <label className="space-y-1">
          <span className="font-medium">GitHub repo link</span>
          <input name="repo_url" type="url" required className={field} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="font-medium">Short description</span>
          <textarea name="description_short" rows={3} maxLength={500} className={field} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="font-medium">Long description</span>
          <textarea name="description_long" rows={5} maxLength={5000} className={field} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className={button}>
            {pending ? "Adding and checking links…" : "Add entry"}
          </button>
          {state.message && (
            <span className={state.status === "error" ? "text-red-600" : "text-foreground/70"} role={state.status === "error" ? "alert" : "status"}>
              {state.message}
            </span>
          )}
        </div>
      </form>
    </details>
  );
}

// Writes AI notes for the next batch of submitted entries without up-to-date notes.
export function AiNotesForm({ world, disabled }: { world: "real" | "test"; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(generateNotes, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="world" value={world} />
      <button type="submit" disabled={pending || disabled} className={button} title={disabled ? "AI_GATEWAY_API_KEY isn't set" : undefined}>
        {pending ? "Writing notes (up to a minute)…" : "Write AI notes"}
      </button>
      {state.message && (
        <span className={`text-xs ${state.status === "error" ? "text-red-600" : "text-foreground/70"}`} role="status">
          {state.message}
        </span>
      )}
    </form>
  );
}

// Spreads entries without a judge across the current world's judges; shows the result inline.
export function AutoAssignForm({ world }: { world: "real" | "test" }) {
  const [state, formAction, pending] = useActionState(autoAssign, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="world" value={world} />
      {state.message && (
        <span className={`text-xs ${state.status === "error" ? "text-red-600" : "text-foreground/70"}`} role="status">
          {state.message}
        </span>
      )}
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Assigning…" : "Auto-assign entries without a judge"}
      </button>
    </form>
  );
}

export type CriterionOption = { key: string; name: string; note?: string; isDefault: boolean };

// The criteria judges score: one checkbox each, at least one on. Disabled while locked.
export function CriteriaForm({ criteria, enabled, locked }: { criteria: CriterionOption[]; enabled: string[]; locked: boolean }) {
  const [state, formAction, pending] = useActionState(setJudgingCriteria, idle);
  const [on, setOn] = useState(() => new Set(enabled));
  const changed = on.size !== enabled.length || enabled.some((k) => !on.has(k));
  return (
    <form action={formAction} className="space-y-2">
      <fieldset disabled={locked || pending} className="space-y-1 disabled:opacity-60">
        <legend className="sr-only">Judging criteria</legend>
        {criteria.map((c) => (
          <label key={c.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="criteria"
              value={c.key}
              checked={on.has(c.key)}
              onChange={(event) => {
                // The last one on stays on (not `disabled`, which would leave it out of the form).
                if (!event.target.checked && on.size === 1) return;
                const next = new Set(on);
                if (event.target.checked) next.add(c.key);
                else next.delete(c.key);
                setOn(next);
              }}
              className="mt-1"
            />
            <span>
              {c.name}
              {!c.isDefault && <span className="text-foreground/60"> (off by default)</span>}
              {c.note && <span className="block text-xs text-foreground/60">{c.note}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      {!locked && (
        <button type="submit" disabled={pending || !changed || on.size === 0} className={button}>
          {pending ? "Saving…" : "Save criteria"}
        </button>
      )}
      {state.message && <p className={`text-xs ${state.status === "error" ? "text-red-600" : "text-foreground/60"}`}>{state.message}</p>}
    </form>
  );
}
