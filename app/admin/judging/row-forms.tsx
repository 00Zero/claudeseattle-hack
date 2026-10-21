"use client";

import { useActionState } from "react";
import { assignJudge, setFinalist, type RowState } from "./actions";

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
