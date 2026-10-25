"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPacific } from "@/lib/time";
import type { PartState } from "../actions";
import type { Teammate } from "../_lib/entry";
import { loadParts, type Part } from "../_lib/parts";

const input = "w-full rounded border border-line-strong bg-bg-raised px-3 py-2";
const idle: PartState = { status: "idle" };
// A part's textarea grows to fit what's written while it has focus, up to this, then scrolls.
const MAX_HEIGHT_PX = 448;
// How often an open page checks for teammates' saves (also whenever the tab comes back into view).
const POLL_MS = 15_000;

// Textareas submit \r\n; the save trims.
const norm = (value: string) => value.replace(/\r\n/g, "\n").trim();

// The newer of two saved versions of a part.
function newer(a: Part, b: Part | undefined) {
  if (!b?.at) return a;
  if (!a.at) return b;
  return Date.parse(b.at) > Date.parse(a.at) ? b : a;
}

// GitHub's mark (Octicons mark-github), for the username tag.
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Message({ state }: { state: PartState }) {
  if (!state.message) return null;
  return (
    <p className={`text-sm ${state.status === "error" ? "text-red-600" : "text-fg-muted"}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}

// A missing GitHub username, highlighted, with a field anyone on the team can fill in.
function AddGithub({ teammate, closed, action }: { teammate: Teammate; closed: boolean; action: (formData: FormData) => Promise<PartState> }) {
  const [state, setState] = useState(idle);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-1 rounded border border-clay bg-accent-soft px-3 py-2 text-sm">
      <p className="font-medium text-clay">No GitHub username</p>
      {closed ? (
        <p className="text-fg-muted">Judges won&apos;t be able to find {teammate.name}&apos;s commits.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => setState(await action(data)));
          }}
          className="flex flex-wrap gap-2 sm:flex-nowrap"
        >
          <input type="hidden" name="profile_id" value={teammate.id} />
          <input
            name="github"
            required
            maxLength={300}
            aria-label={`GitHub username for ${teammate.name}`}
            placeholder="username or github.com/username"
            className={input}
            disabled={pending}
          />
          <button type="submit" disabled={pending} className="btn btn-ghost shrink-0 disabled:opacity-50">
            {pending ? "Adding…" : "Add"}
          </button>
        </form>
      )}
      <Message state={state} />
    </div>
  );
}

// One teammate's part, editable by anyone on the team: a textarea that grows to show all of it
// while you're in it, saved on its own. `remote` is the newest saved version this page has seen.
function PartEditor({
  teammate,
  remote,
  mine,
  nameOf,
  limit,
  action,
  onSaved,
}: {
  teammate: Teammate;
  remote: Part;
  mine: boolean;
  nameOf: (id: string | null) => string;
  limit: number;
  action: (formData: FormData) => Promise<PartState>;
  onSaved: (part: Part) => void;
}) {
  const [value, setValue] = useState(remote.body);
  // The saved version this editor is in step with. The save sends its time, so a teammate's save
  // in between is caught instead of overwritten.
  const [base, setBase] = useState(remote);
  // A teammate's saved version that differs from what this editor is typing.
  const [theirs, setTheirs] = useState<Part | null>(null);
  const [seenAt, setSeenAt] = useState(remote.at);
  const [focused, setFocused] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState(idle);
  const [pending, startTransition] = useTransition();
  const dirty = norm(value) !== norm(base.body);

  // A newer save landed: take it if this editor hasn't changed anything, otherwise offer it.
  if (remote.at !== seenAt) {
    setSeenAt(remote.at);
    if (remote.at && remote.at !== base.at && newer(base, remote) === remote) {
      if (!dirty || norm(remote.body) === norm(value)) {
        setValue(dirty ? value : remote.body);
        setBase(remote);
        setTheirs(null);
      } else {
        setTheirs(remote);
      }
    }
  }

  function pick(useTheirs: boolean) {
    if (!theirs) return;
    if (useTheirs) setValue(theirs.body);
    // Keep mine: the next save replaces theirs, on purpose.
    setBase(theirs);
    setTheirs(null);
    setState(idle);
  }

  // Focused: as tall as the text (so nothing written is hidden). Otherwise back to its four rows.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "";
    if (focused) el.style.height = `${Math.min(el.scrollHeight + 2, MAX_HEIGHT_PX)}px`;
  }, [focused, value]);

  const id = `part-${teammate.id}`;
  const firstName = teammate.name.split(" ")[0];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("base_at", base.at ?? "");
        startTransition(async () => {
          const result = await action(data);
          setState(result);
          if (result.conflict && result.part) setTheirs(result.part);
          else if (result.status === "ok" && result.part) {
            setBase(result.part);
            setTheirs(null);
            onSaved(result.part);
          }
        });
      }}
      // Clicking Save (or a version to keep) mustn't blur the textarea first: it would shrink, the
      // button would move up, and the click would miss it.
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("button, summary")) event.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="profile_id" value={teammate.id} />
      <label htmlFor={id} className="block text-sm font-medium">
        {mine ? "What you worked on" : `What ${firstName} worked on`}
      </label>
      <textarea
        ref={textarea}
        id={id}
        name="contribution"
        rows={4}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={limit}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={pending}
        placeholder={
          mine
            ? "e.g. Talked to the bakery owner about the problem, designed the order flow, built the Claude prompt that drafts replies."
            : `What did ${firstName} do? They can edit it too.`
        }
        className={input}
      />

      {theirs && (
        <div className="space-y-2 rounded border border-clay px-3 py-2 text-sm" role="status">
          <p>{nameOf(theirs.by)} saved a different version while you were editing.</p>
          <details>
            <summary className="cursor-pointer underline">Show their version</summary>
            <p className="mt-1 whitespace-pre-wrap text-fg-muted">{theirs.body || "(empty)"}</p>
          </details>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pick(true)} className="btn btn-ghost">
              Use theirs
            </button>
            <button type="button" onClick={() => pick(false)} className="btn btn-ghost">
              Keep mine
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !dirty || Boolean(theirs)} className="btn disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-fg-faint">
          {value.length}/{limit}
          {dirty ? " · not saved yet" : base.at ? ` · saved ${formatPacific(base.at)} by ${nameOf(base.by)}` : ""}
        </span>
      </div>
      <Message state={state} />
    </form>
  );
}

// "Who did what": a section per teammate. Anyone on the team can write any teammate's part and add
// a missing GitHub username; each part saves on its own, so nobody overwrites anyone else's.
export function Contributions({
  teamId,
  teammates,
  me,
  closed,
  legacy,
  limit,
  saveAction,
  githubAction,
}: {
  teamId: string;
  teammates: Teammate[];
  me: string;
  closed: boolean;
  // The shared "who did what" written before each teammate had their own part.
  legacy: string;
  limit: number;
  saveAction: (formData: FormData) => Promise<PartState>;
  githubAction: (formData: FormData) => Promise<PartState>;
}) {
  // Saves this page has seen since it loaded, from polling and from its own saves.
  const [seen, setSeen] = useState<Map<string, Part>>(() => new Map());
  const partOf = (t: Teammate) => newer(t.part, seen.get(t.id));
  const nameOf = (id: string | null) => (id === me ? "you" : (teammates.find((t) => t.id === id)?.name ?? "a teammate"));

  // Reads run as the user in the browser, so they cost no server calls; RLS limits them to the team.
  const poll = useEffectEvent(async () => {
    if (document.hidden || closed) return;
    const parts = await loadParts(createClient(), teamId);
    setSeen((prev) => {
      const next = new Map(prev);
      for (const [id, part] of parts) next.set(id, newer(part, prev.get(id)));
      return next;
    });
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

  const written = teammates.filter((t) => partOf(t).body.trim()).length;
  const noGithub = teammates.filter((t) => !t.github).length;

  return (
    <section className="space-y-4" aria-labelledby="contributions-heading">
      <div className="space-y-1">
        <h2 id="contributions-heading" className="text-lg font-medium">
          Who did what
        </h2>
        <p className="text-sm text-fg-muted">
          Judges score teamwork. Write what each person did; anyone on the team can fill in or edit any section, and each one saves on its own. Business, design, research, and
          pitch work count as much as code.
        </p>
        <p className="font-mono text-xs text-fg-faint">
          {written} of {teammates.length} written
          {noGithub > 0 && ` · ${noGithub} missing a GitHub username (anyone on the team can add it)`}
        </p>
      </div>

      <ul className="space-y-3">
        {teammates.map((t) => {
          const mine = t.id === me;
          const part = partOf(t);
          return (
            <li key={t.id} className={`space-y-3 rounded-lg border p-4 ${t.github ? "border-line" : "border-clay"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-medium">
                  {t.name}
                  {mine && <span className="text-fg-muted"> (you)</span>}
                </h3>
                {t.isLeader && <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-xs">Team lead</span>}
                {t.role && <span className="rounded-full border border-line px-2 py-0.5 font-mono text-xs text-fg-muted">{t.role}</span>}
                {t.github && (
                  <a
                    href={`https://github.com/${t.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t.githubByTeam ? `${t.name}'s GitHub profile, added by a teammate` : `${t.name}'s GitHub profile`}
                    className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black px-2 py-0.5 font-mono text-xs text-white no-underline hover:bg-neutral-800"
                  >
                    <GitHubMark />@{t.github}
                  </a>
                )}
              </div>

              {!t.github && <AddGithub teammate={t} closed={closed} action={githubAction} />}

              {closed ? (
                part.body.trim() ? (
                  <div className="space-y-1">
                    <p className="whitespace-pre-wrap text-sm text-fg-muted">{part.body}</p>
                    {part.at && (
                      <p className="text-xs text-fg-faint">
                        Saved {formatPacific(part.at)} by {nameOf(part.by)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-fg-faint">Nothing written.</p>
                )
              ) : (
                <PartEditor
                  teammate={t}
                  remote={part}
                  mine={mine}
                  nameOf={nameOf}
                  limit={limit}
                  action={saveAction}
                  onSaved={(saved) => setSeen((prev) => new Map(prev).set(t.id, saved))}
                />
              )}
            </li>
          );
        })}
      </ul>

      {legacy.trim() && (
        <div className="space-y-1 rounded border border-dashed border-line px-3 py-2">
          <h3 className="eyebrow">Written earlier for the whole team</h3>
          <p className="whitespace-pre-wrap text-sm text-fg-muted">{legacy}</p>
        </div>
      )}
    </section>
  );
}
