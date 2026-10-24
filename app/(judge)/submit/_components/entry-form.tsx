"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import type { SaveState } from "../actions";
import type { EntryLink, EntryValues } from "../_lib/entry";

const input = "w-full rounded border border-line-strong bg-bg-raised px-3 py-2";
const idle: SaveState = { status: "idle" };

type Limits = { title: number; tagline: number; description_short: number; description_long: number; url: number; linkLabel: number; links: number };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-sm text-fg-muted">{hint}</span>}
      {children}
    </label>
  );
}

export function EntryForm({
  action,
  values,
  lastSavedAt,
  limits,
  videoHint,
}: {
  action: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  values: EntryValues;
  lastSavedAt: string;
  limits: Limits;
  videoHint: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  // Stable keys, so removing a row doesn't shift typed text into the wrong inputs.
  const nextKey = useRef(values.links.length);
  const [links, setLinks] = useState<(EntryLink & { key: number })[]>(() => values.links.map((link, key) => ({ ...link, key })));

  return (
    <form
      // Submit by hand so a failed save keeps what was typed (React resets forms after an action).
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-5"
    >
      {/* The version this form was loaded from; the save refuses if a teammate saved since. */}
      <input type="hidden" name="last_saved_at" value={lastSavedAt} />
      <Field label="Title">
        <input name="title" required maxLength={limits.title} defaultValue={values.title} className={input} />
      </Field>
      <Field label="Tagline" hint="One line: what it does and for whom.">
        <input name="tagline" maxLength={limits.tagline} defaultValue={values.tagline} className={input} />
      </Field>
      <Field label="Short description" hint="A few sentences judges read first: the problem, the small business, what you built.">
        <textarea name="description_short" rows={4} maxLength={limits.description_short} defaultValue={values.description_short} className={input} />
      </Field>
      <Field
        label="Long description"
        hint="How it works, how a business would set it up, what's still rough. Judges review without talking to you, so put it here."
      >
        <textarea name="description_long" rows={10} maxLength={limits.description_long} defaultValue={values.description_long} className={input} />
      </Field>
      <Field label="Demo video link (required)" hint={`${videoHint}. Show the problem, the solution, and a walkthrough.`}>
        <input name="video_url" type="url" required inputMode="url" placeholder="https://www.youtube.com/watch?v=…" maxLength={limits.url} defaultValue={values.video_url} className={input} />
      </Field>
      <Field label="GitHub repo link (required)" hint="Public, with a README a small business could follow. It's shared with other businesses after the event.">
        <input name="repo_url" type="url" required inputMode="url" placeholder="https://github.com/your-org/your-repo" maxLength={limits.url} defaultValue={values.repo_url} className={input} />
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
