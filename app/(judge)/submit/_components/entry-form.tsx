"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPacific } from "@/lib/time";
import type { PartEdit, PartResult, PartState, SaveState } from "../actions";
import type { Teammate } from "../_lib/entry";
import { Contributions, type ContributionsHandle } from "./contributions";
import type { EntryLink, EntryValues } from "../_lib/entry";
import { cleanLinks, FIELDS, loadSavedEntry, same, withField, type Field, type SavedEntry } from "../_lib/merge";

const input = "w-full rounded border border-line-strong bg-bg-raised px-3 py-2";
const idle: SaveState = { status: "idle" };
// How often an open form checks for teammates' saves (also whenever the tab comes back into view).
const POLL_MS = 15_000;

type Limits = { title: number; tagline: number; description: number; url: number; linkLabel: number; links: number };

// A teammate's saved version of a field this editor is in the middle of changing.
type Theirs = { value: EntryValues[Field]; by: string | null };

function Field({ label, hint, note, children }: { label: string; hint?: React.ReactNode; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="block text-sm text-fg-muted">{hint}</span>}
        {children}
      </label>
      {note}
    </div>
  );
}

function TheirVersion({ theirs, onUse, onKeep }: { theirs: Theirs; onUse: () => void; onKeep: () => void }) {
  const text =
    typeof theirs.value === "string"
      ? theirs.value
      : theirs.value.map((link) => (link.label === link.url ? link.url : `${link.label}: ${link.url}`)).join("\n");
  return (
    <div className="space-y-2 rounded border border-clay px-3 py-2 text-sm" role="status">
      <p>{theirs.by ?? "A teammate"} saved a different version of this field while you were editing it.</p>
      <details>
        <summary className="cursor-pointer underline">Show their version</summary>
        <p className="mt-1 whitespace-pre-wrap text-fg-muted">{text || "(empty)"}</p>
      </details>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onUse} className="btn btn-ghost">
          Use theirs
        </button>
        <button type="button" onClick={onKeep} className="btn btn-ghost">
          Keep mine
        </button>
      </div>
    </div>
  );
}

// "Who did what", shown while Teamwork is a judging criterion.
type ContributionsConfig = {
  teammates: Teammate[];
  me: string;
  closed: boolean;
  legacy: string;
  limit: number;
  githubAction: (formData: FormData) => Promise<PartState>;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function names(list: string[]) {
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? "");
}

// One message for a Save that wrote the entry and teammates' parts.
function combined(entry: SaveState | null, parts: PartResult[], nameOf: (id: string) => string): SaveState {
  const saved = parts.filter((r) => r.status === "ok").map((r) => nameOf(r.profile_id));
  const conflicts = parts.filter((r) => r.status === "conflict").map((r) => nameOf(r.profile_id));
  const errors = parts.filter((r) => r.status === "error").map((r) => r.message ?? "");
  const messages = [
    entry?.message,
    saved.length > 0 && `Saved who did what for ${names(saved)}.`,
    conflicts.length > 0 &&
      `${names(conflicts)}'s part${conflicts.length === 1 ? " was" : "s were"} changed by a teammate meanwhile, so ${conflicts.length === 1 ? "it wasn't" : "they weren't"} saved: pick a version there, then save again.`,
    errors[0],
  ].filter(Boolean);
  const failed = entry?.status === "error" || conflicts.length > 0 || errors.length > 0;
  return { status: failed ? "error" : (entry?.status ?? "ok"), message: messages.join(" "), entry: entry?.entry };
}

export function EntryForm({
  action,
  partsAction,
  contributions,
  teamId,
  saved,
  limits,
  videoHint,
  closesAt,
}: {
  action: (formData: FormData) => Promise<SaveState>;
  teamId: string;
  saved: SavedEntry;
  limits: Limits;
  videoHint: string;
  // After this, a save needs a confirm click first: it's kept but marked late.
  closesAt: string;
  partsAction: (edits: PartEdit[]) => Promise<PartResult[]>;
  contributions: ContributionsConfig | null;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, setState] = useState(idle);
  const [pending, startTransition] = useTransition();
  // The form differs from the saved version it's in step with, and when that was saved.
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(saved.savedAt);
  // "Who did what" parts edited and not saved yet, by teammate.
  const parts = useRef<ContributionsHandle>(null);
  const [partsDirty, setPartsDirty] = useState<Record<string, boolean>>({});
  const onPartDirty = useCallback((id: string, isDirty: boolean) => setPartsDirty((prev) => (Boolean(prev[id]) === isDirty ? prev : { ...prev, [id]: isDirty })), []);
  const dirtyParts = Object.values(partsDirty).filter(Boolean).length;
  // Showing the "this save will be late" warning; confirmLate makes the next submit send it.
  const [askLate, setAskLate] = useState(false);
  const confirmLate = useRef(false);
  // Per field, the saved value this form was last in step with. The save sends it, so the server
  // can tell this editor's changes from fields they left alone.
  const base = useRef(saved.values);
  const seenAt = useRef(saved.savedAt);
  const [theirs, setTheirs] = useState<Partial<Record<Field, Theirs>>>({});
  // Stable keys, so removing a row doesn't shift typed text into the wrong inputs.
  const nextKey = useRef(saved.values.links.length);
  const [links, setLinks] = useState<(EntryLink & { key: number })[]>(() => saved.values.links.map((link, key) => ({ ...link, key })));

  function textInput(field: Field) {
    return form.current!.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement;
  }

  function formValue(field: Field): EntryValues[Field] {
    if (field !== "links") return textInput(field).value;
    const all = (name: string) => [...form.current!.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)].map((el) => el.value);
    const labels = all("link_label");
    return cleanLinks(all("link_url").map((url, i) => ({ label: labels[i] ?? "", url })));
  }

  function recheck() {
    if (form.current) setDirty(FIELDS.some((field) => !same(formValue(field), base.current[field])));
  }
  // After a change that re-renders inputs (link rows), once the DOM has them.
  function recheckSoon() {
    requestAnimationFrame(recheck);
  }

  function setFormValue(field: Field, value: EntryValues[Field]) {
    if (field !== "links") {
      textInput(field).value = value as string;
      return;
    }
    const rows = (value as EntryLink[]).map((link) => ({ ...link, key: nextKey.current++ }));
    setLinks(rows);
  }

  // Bring in a newer saved version. Fields the editor hasn't changed take it; fields they're
  // changing keep their typing and, where the saved version differs, show it to pick from.
  function receive(next: SavedEntry) {
    if (!form.current || next.savedAt === seenAt.current) return;
    if (seenAt.current && next.savedAt && Date.parse(next.savedAt) < Date.parse(seenAt.current)) return;
    seenAt.current = next.savedAt;
    setLastSaved(next.savedAt);
    const updates: Partial<Record<Field, Theirs | null>> = {};
    for (const field of FIELDS) {
      const mine = formValue(field);
      const was = base.current[field];
      const now = next.values[field];
      if (same(mine, now) || same(mine, was)) {
        if (!same(mine, now)) setFormValue(field, now);
        base.current = withField(base.current, field, now);
        updates[field] = null;
      } else if (!same(now, was)) {
        updates[field] = { value: now, by: next.savedBy };
      }
    }
    setTheirs((prev) => {
      const out = { ...prev };
      for (const field of FIELDS) {
        const update = updates[field];
        if (update === null) delete out[field];
        else if (update) out[field] = update;
      }
      return out;
    });
    recheckSoon();
  }

  // Use theirs: the field takes the teammate's value. Keep mine: the next save overwrites theirs.
  function resolve(field: Field, useTheirs: boolean) {
    const version = theirs[field];
    if (!version) return;
    if (useTheirs) setFormValue(field, version.value);
    base.current = withField(base.current, field, version.value);
    setTheirs((prev) => {
      const out = { ...prev };
      delete out[field];
      return out;
    });
    recheckSoon();
  }

  function note(field: Field) {
    const version = theirs[field];
    return version && <TheirVersion theirs={version} onUse={() => resolve(field, true)} onKeep={() => resolve(field, false)} />;
  }

  // Reads run as the user in the browser, so they cost no server calls; RLS limits them to the team.
  const poll = useEffectEvent(async () => {
    if (document.hidden || pending) return;
    const next = await loadSavedEntry(createClient(), teamId);
    if (next && next.savedAt !== seenAt.current) {
      receive(next);
      router.refresh(); // "Last saved" and the checklist
    }
  });
  useEffect(() => {
    const timer = setInterval(() => poll(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <form
      ref={form}
      onInput={recheck}
      // Submit by hand so a failed save keeps what was typed (React resets forms after an action).
      onSubmit={(event) => {
        event.preventDefault();
        const confirmed = confirmLate.current;
        confirmLate.current = false;
        // Edited teammate parts go with the entry. The entry itself is saved when it changed, or
        // when nothing else did (saving again rechecks its links).
        const edits = parts.current?.collect() ?? [];
        const withEntry = dirty || edits.length === 0;
        // Past the deadline by this browser's clock: ask before saving. The server checks too.
        if (withEntry && !confirmed && Date.now() >= Date.parse(closesAt)) {
          setAskLate(true);
          return;
        }
        setAskLate(false);
        const data = new FormData(event.currentTarget);
        data.set("base", JSON.stringify(base.current));
        if (confirmed) data.set("confirm_late", "yes");
        startTransition(async () => {
          const [entryResult, partResults] = await Promise.all([withEntry ? action(data) : Promise.resolve(null), edits.length ? partsAction(edits) : Promise.resolve([])]);
          parts.current?.apply(partResults);
          if (entryResult?.status === "confirm_late") {
            setAskLate(true);
            setState(idle);
            return;
          }
          if (entryResult?.entry) receive(entryResult.entry);
          setState(combined(entryResult, partResults, (id) => contributions?.teammates.find((t) => t.id === id)?.name ?? "a teammate"));
        });
      }}
      className="space-y-5"
    >
      {/* Locked while saving, so nothing typed meanwhile is mistaken for a teammate's change. */}
      <fieldset disabled={pending} className="space-y-5">
        <Field label="Title" note={note("title")}>
          <input name="title" required maxLength={limits.title} defaultValue={saved.values.title} className={input} />
        </Field>
        <Field label="Tagline" hint="One line: what it does and for whom." note={note("tagline")}>
          <input name="tagline" maxLength={limits.tagline} defaultValue={saved.values.tagline} className={input} />
        </Field>
        <Field
          label="Description"
          hint="The problem and the small business it's for, what you built and how it works, how a business would set it up, and what's still rough. Judges review without talking to you, so put it here."
          note={note("description")}
        >
          <textarea name="description" rows={12} maxLength={limits.description} defaultValue={saved.values.description} className={input} />
        </Field>
        <Field label="Demo video link (required)" hint={
            <>
              {videoHint}. Show the problem, the solution, and a walkthrough.{" "}
              <strong className="font-semibold text-red-600">Keep it to 3 minutes or less: judges stop watching at 3:00.</strong>
            </>
          } note={note("video_url")}>
          <input name="video_url" type="url" required inputMode="url" placeholder="https://www.youtube.com/watch?v=…" maxLength={limits.url} defaultValue={saved.values.video_url} className={input} />
        </Field>
        <Field
          label="GitHub repo link (required)"
          hint="Public, with a README a small business could follow. It's shared with other businesses after the event."
          note={note("repo_url")}
        >
          <input name="repo_url" type="url" required inputMode="url" placeholder="https://github.com/your-org/your-repo" maxLength={limits.url} defaultValue={saved.values.repo_url} className={input} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Other links</legend>
          <p className="text-sm text-fg-muted">Live app, slides, or anything judges can try.</p>
          {links.map((link, i) => (
            <div key={link.key} className="flex flex-wrap gap-2 sm:flex-nowrap">
              <input
                name="link_label"
                aria-label={`Link ${i + 1} label`}
                placeholder="Label, e.g. Live app"
                maxLength={limits.linkLabel}
                defaultValue={link.label}
                className={`${input} sm:w-48`}
              />
              <input
                name="link_url"
                type="url"
                inputMode="url"
                aria-label={`Link ${i + 1} URL`}
                placeholder="https://…"
                maxLength={limits.url}
                defaultValue={link.url}
                className={input}
              />
              <button
                type="button"
                onClick={() => {
                  setLinks(links.filter((l) => l.key !== link.key));
                  recheckSoon();
                }}
                className="btn btn-ghost shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
          {links.length < limits.links && (
            <button type="button" onClick={() => setLinks([...links, { label: "", url: "", key: nextKey.current++ }])} className="text-sm underline">
              Add a link
            </button>
          )}
          {note("links")}
        </fieldset>

        {/* The shared "who did what" from before teammates wrote their own parts: kept as it is. */}
        <input type="hidden" name="contributions" defaultValue={saved.values.contributions} />
      </fieldset>

      {contributions && (
        <Contributions
          ref={parts}
          teamId={teamId}
          teammates={contributions.teammates}
          me={contributions.me}
          closed={contributions.closed}
          disabled={pending}
          legacy={contributions.legacy}
          limit={contributions.limit}
          githubAction={contributions.githubAction}
          onDirty={onPartDirty}
        />
      )}

      {/* One Save for the entry and "who did what", stuck to the bottom of the screen while the
          form is in view. Room on the right for the /feedback button. */}
      <div className="sticky bottom-0 z-30 space-y-2 border-t border-line bg-bg pt-3 pr-28 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {state.message && (
          <p
            className={`text-sm ${state.status === "error" ? "text-red-600" : state.status === "late" ? "text-fg" : "text-fg-muted"}`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        )}
        {askLate ? (
          <div className="space-y-3 rounded border border-red-600 bg-accent-soft px-4 py-3" role="alertdialog" aria-labelledby="late-heading" aria-describedby="late-detail">
            <p id="late-heading" className="font-semibold text-red-600">
              Submissions closed {formatPacific(closesAt)}.
            </p>
            <p id="late-detail" className="text-sm">
              Saves after the deadline are kept, but your project will be marked as <strong>submitted late</strong>. Save anyway?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  confirmLate.current = true;
                  form.current?.requestSubmit();
                }}
                className="btn disabled:opacity-50"
              >
                Save and mark as late
              </button>
              <button type="button" disabled={pending} onClick={() => setAskLate(false)} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* Keeps focus where it is: blurring a "who did what" box shrinks it, which would move this
                button out from under the click when the bar is at the end of the form. */}
            <button type="submit" disabled={pending} onMouseDown={(event) => event.preventDefault()} className="btn disabled:opacity-50">
              {pending ? "Saving…" : "Save"}
            </button>
            {!pending && (
              <span className={`text-sm ${dirty || dirtyParts ? "font-medium text-clay" : "text-fg-muted"}`} aria-live="polite">
                {dirty || dirtyParts
                  ? `Unsaved changes${dirty && dirtyParts ? ` to the entry and ${plural(dirtyParts, "teammate")}` : dirtyParts ? ` for ${plural(dirtyParts, "teammate")}` : ""}`
                  : lastSaved
                    ? `Saved ${formatPacific(lastSaved)}`
                    : "Not saved yet"}
              </span>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
