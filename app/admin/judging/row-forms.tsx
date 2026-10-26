"use client";

import { startTransition, useActionState, useState } from "react";
import {
  acceptLateInGrace,
  addGroupMember,
  assignJudge,
  autoAssign,
  createFallbackEntry,
  createGroup,
  deleteGroup,
  generateNotes,
  removeGroupMember,
  setFinalist,
  setJudgingCriteria,
  type RowState,
} from "./actions";

const select = "rounded border border-foreground/20 bg-background text-xs disabled:opacity-60";
const button = "rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5 disabled:cursor-wait disabled:opacity-50";
const idle: RowState = { status: "idle" };

export type JudgeOption = { id: string; name: string };
// Who judges an entry: a group ("group:<id>") or a judge in no group ("judge:<id>").
export type UnitOption = { value: string; name: string; load: number };

// Judge dropdown for one entry: groups first, then judges in no group, each with its current load.
export function JudgeForm({ entryId, unit, units }: { entryId: string; unit: string | null; units: UnitOption[] }) {
  const [state, formAction, pending] = useActionState(assignJudge, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="entry_id" value={entryId} />
      <select key={unit ?? ""} name="unit" defaultValue={unit ?? ""} disabled={pending} className={select} aria-label="Judge or group">
        <option value="">No judge</option>
        {units.map((u) => (
          <option key={u.value} value={u.value}>
            {u.name} ({u.load})
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
          <span className="font-medium">Description</span>
          <textarea name="description" rows={6} maxLength={6000} className={field} />
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

// Accepts every waiting late save from the grace period at once, oldest first.
export function AcceptGraceForm({ world, waiting }: { world: "real" | "test"; waiting: number }) {
  const [state, formAction, pending] = useActionState(acceptLateInGrace, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="world" value={world} />
      <button type="submit" disabled={pending || waiting === 0} className={button}>
        {pending ? "Accepting…" : `Accept all ${waiting} from the grace period`}
      </button>
      <Message state={state} />
    </form>
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

function Message({ state }: { state: RowState }) {
  if (!state.message) return null;
  return (
    <span className={`text-xs ${state.status === "error" ? "text-red-600" : "text-foreground/70"}`} role="status">
      {state.message}
    </span>
  );
}

// New judging group: a name and two or more judges who aren't in a group yet.
export function CreateGroupForm({ world, judges }: { world: "real" | "test"; judges: JudgeOption[] }) {
  const [state, formAction, pending] = useActionState(createGroup, idle);
  return (
    <form action={formAction} key={state.status === "ok" ? state.message : "form"} className="space-y-2 rounded border border-foreground/15 px-3 py-2">
      <input type="hidden" name="world" value={world} />
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">New group</span>
        <input name="name" required maxLength={60} placeholder="Group name" className="rounded border border-foreground/20 bg-background px-2 py-0.5 text-sm" />
      </label>
      {judges.length < 2 ? (
        <p className="text-xs text-foreground/60">A group needs two judges who aren&apos;t in a group yet.</p>
      ) : (
        <fieldset disabled={pending} className="flex flex-wrap gap-x-4 gap-y-1">
          <legend className="sr-only">Judges</legend>
          {judges.map((j) => (
            <label key={j.id} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="judge_id" value={j.id} />
              {j.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || judges.length < 2} className={button}>
          {pending ? "Creating…" : "Create group"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

// Add one judge who isn't in a group to this group.
export function AddMemberForm({ groupId, judges }: { groupId: string; judges: JudgeOption[] }) {
  const [state, formAction, pending] = useActionState(addGroupMember, idle);
  if (!judges.length) return null;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="group_id" value={groupId} />
      <select name="judge_id" defaultValue="" required disabled={pending} className={select} aria-label="Judge to add">
        <option value="" disabled>
          Add a judge…
        </option>
        {judges.map((j) => (
          <option key={j.id} value={j.id}>
            {j.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Adding…" : "Add"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function RemoveMemberButton({ groupId, judgeId, name, last }: { groupId: string; judgeId: string; name: string; last: boolean }) {
  const [state, formAction, pending] = useActionState(removeGroupMember, idle);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const note = last
          ? `${name} is the last judge in this group. Remove them and delete the group? They keep its entries, judging alone.`
          : `Remove ${name} from this group? The group keeps its entries; ${name}'s scores for them stop counting.`;
        if (!confirm(note)) event.preventDefault();
      }}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="judge_id" value={judgeId} />
      <button type="submit" disabled={pending} className="text-xs text-foreground/60 underline hover:text-foreground" aria-label={`Remove ${name}`}>
        {pending ? "removing…" : "remove"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function DeleteGroupButton({ groupId, name, entries }: { groupId: string; name: string; entries: number }) {
  const [state, formAction, pending] = useActionState(deleteGroup, idle);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const note = `Delete ${name}? Its judges go back to judging alone${entries ? `, and its ${entries} entr${entries === 1 ? "y goes" : "ies go"} back to having no judge` : ""}. Saved scores stay.`;
        if (!confirm(note)) event.preventDefault();
      }}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="group_id" value={groupId} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Deleting…" : "Delete group"}
      </button>
      <Message state={state} />
    </form>
  );
}

export type CriterionOption ={ key: string; name: string; note?: string; isDefault: boolean };

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
