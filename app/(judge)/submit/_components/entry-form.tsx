"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SaveState } from "../actions";
import type { EntryLink, EntryValues } from "../_lib/entry";
import { cleanLinks, FIELDS, loadSavedEntry, same, withField, type Field, type SavedEntry } from "../_lib/merge";

const input = "w-full rounded border border-line-strong bg-bg-raised px-3 py-2";
const idle: SaveState = { status: "idle" };
// How often an open form checks for teammates' saves (also whenever the tab comes back into view).
const POLL_MS = 15_000;

type Limits = { title: number; tagline: number; description_short: number; description_long: number; url: number; linkLabel: number; links: number; contributions: number };

// A teammate's saved version of a field this editor is in the middle of changing.
type Theirs = { value: EntryValues[Field]; by: string | null };

function Field({ label, hint, note, children }: { label: string; hint?: string; note?: React.ReactNode; children: React.ReactNode }) {
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

export function EntryForm({
  action,
  teamId,
  saved,
  limits,
  videoHint,
  teamwork,
}: {
  action: (formData: FormData) => Promise<SaveState>;
  teamId: string;
  saved: SavedEntry;
  limits: Limits;
  videoHint: string;
  // Teamwork is a judging criterion: show "Who did what". Otherwise it rides along hidden, so a
  // save never clears what teammates wrote while it was on.
  teamwork: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, setState] = useState(idle);
  const [pending, startTransition] = useTransition();
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
      // Submit by hand so a failed save keeps what was typed (React resets forms after an action).
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("base", JSON.stringify(base.current));
        startTransition(async () => {
          const result = await action(data);
          setState(result);
          if (result.entry) receive(result.entry);
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
          label="Short description"
          hint="A few sentences judges read first: the problem, the small business, what you built."
          note={note("description_short")}
        >
          <textarea name="description_short" rows={4} maxLength={limits.description_short} defaultValue={saved.values.description_short} className={input} />
        </Field>
        <Field
          label="Long description"
          hint="How it works, how a business would set it up, what's still rough. Judges review without talking to you, so put it here."
          note={note("description_long")}
        >
          <textarea name="description_long" rows={10} maxLength={limits.description_long} defaultValue={saved.values.description_long} className={input} />
        </Field>
        <Field label="Demo video link (required)" hint={`${videoHint}. Show the problem, the solution, and a walkthrough.`} note={note("video_url")}>
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
              <button type="button" onClick={() => setLinks(links.filter((l) => l.key !== link.key))} className="btn btn-ghost shrink-0">
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

        {teamwork ? (
          <Field
            label="Who did what (optional)"
            hint="A line per teammate: their role and what they did. Judges score teamwork, and business, design, research, and pitch roles count as much as code."
            note={note("contributions")}
          >
            <textarea
              name="contributions"
              rows={4}
              maxLength={limits.contributions}
              placeholder={"Sam (business owner): the problem, tested it with customers\nAlex: built the workflow"}
              defaultValue={saved.values.contributions}
              className={input}
            />
          </Field>
        ) : (
          <input type="hidden" name="contributions" defaultValue={saved.values.contributions} />
        )}
      </fieldset>

      {state.message && (
        <p
          className={`text-sm ${state.status === "error" ? "text-red-600" : state.status === "late" ? "text-fg" : "text-fg-muted"}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn disabled:opacity-50">
        {pending ? "Saving and checking links…" : "Save entry"}
      </button>
    </form>
  );
}
