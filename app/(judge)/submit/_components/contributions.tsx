"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useRef, useState, useTransition, type Ref } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPacific } from "@/lib/time";
import type { PartEdit, PartResult, PartState } from "../actions";
import type { Teammate } from "../_lib/entry";
import { ErrorMessage } from "./error-info";
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

// What the entry form's Save asks of this section: the edited parts to send, and where to put
// what came back.
export type ContributionsHandle = { collect: () => PartEdit[]; apply: (results: PartResult[]) => void };
type PartHandle = { edit: () => PartEdit | null; apply: (result: PartResult) => void };

// GitHub's mark (Octicons mark-github), for the username tag.
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// The GitHub tag's tooltip: usernames are changed on each person's own /profile page.
function githubTip(t: Teammate, mine: boolean) {
  const first = t.name.split(" ")[0];
  if (t.githubByTeam) {
    return mine
      ? "A teammate added this for you. Set your own on your /profile page; it replaces this one."
      : `A teammate added this. ${first} can set their own on their /profile page; it replaces this one.`;
  }
  return mine ? "Change your GitHub username on your /profile page." : `${first} can update their GitHub username on their /profile page.`;
}

// A missing GitHub username, highlighted, with a field anyone on the team can fill in. Not a form
// (it sits inside the entry form), so Add and Enter call the action directly.
function AddGithub({ teammate, action }: { teammate: Teammate; action: (formData: FormData) => Promise<PartState> }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState(idle);
  const [pending, startTransition] = useTransition();
  function add() {
    if (!value.trim()) return;
    const data = new FormData();
    data.set("profile_id", teammate.id);
    data.set("github", value);
    startTransition(async () => {
      try {
        setState(await action(data));
      } catch {
        setState({
          status: "error",
          message: "We couldn't reach the server, so it wasn't added.",
          details: ["Your internet connection may have dropped, or the site was updating. Check that you're online, then press Add again."],
        });
      }
    });
  }
  return (
    <div className="space-y-1 rounded border border-clay bg-accent-soft px-3 py-2 text-sm">
      <p className="font-medium text-clay">No GitHub username</p>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the username instead of saving the whole entry.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          maxLength={300}
          aria-label={`GitHub username for ${teammate.name}`}
          placeholder="username or github.com/username"
          className={input}
          disabled={pending}
        />
        <button type="button" onClick={add} disabled={pending || !value.trim()} className="btn btn-ghost shrink-0 disabled:opacity-50">
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.message &&
        (state.status === "error" ? (
          <ErrorMessage message={state.message} details={state.details} />
        ) : (
          <p className="text-fg-muted" role="status">
            {state.message}
          </p>
        ))}
    </div>
  );
}

// One teammate's part, editable by anyone on the team: a textarea that grows to show all of it
// while you're in it. The entry form's Save sends it when it's changed. `remote` is the newest
// saved version this page has seen.
function PartEditor({
  ref,
  teammate,
  remote,
  mine,
  nameOf,
  limit,
  disabled,
  closesAt,
  onDirty,
  onSaved,
}: {
  ref: Ref<PartHandle>;
  teammate: Teammate;
  remote: Part;
  mine: boolean;
  nameOf: (id: string | null) => string;
  limit: number;
  disabled: boolean;
  closesAt: string;
  onDirty: (id: string, dirty: boolean) => void;
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

  useImperativeHandle(
    ref,
    () => ({
      // Not sent while a teammate's version is waiting to be picked.
      edit: () => (dirty && !theirs ? { profile_id: teammate.id, body: value, base_at: base.at } : null),
      apply: (result) => {
        if (result.status === "ok" && result.part) {
          setBase(result.part);
          setTheirs(null);
          onSaved(result.part);
        } else if (result.status === "conflict" && result.part) {
          setTheirs(result.part);
        }
      },
    }),
    [dirty, theirs, teammate.id, value, base.at, onSaved],
  );

  const reportDirty = useEffectEvent((next: boolean) => onDirty(teammate.id, next));
  useEffect(() => reportDirty(dirty), [dirty]);

  // Focused: as tall as the text (so nothing written is hidden). Otherwise back to its four rows.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "";
    if (focused) el.style.height = `${Math.min(el.scrollHeight + 2, MAX_HEIGHT_PX)}px`;
  }, [focused, value]);

  function pick(useTheirs: boolean) {
    if (!theirs) return;
    if (useTheirs) setValue(theirs.body);
    // Keep mine: the next save replaces theirs, on purpose.
    setBase(theirs);
    setTheirs(null);
  }

  const id = `part-${teammate.id}`;
  const firstName = teammate.name.split(" ")[0];
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {mine ? "What you worked on" : `What ${firstName} worked on`}
      </label>
      <textarea
        ref={textarea}
        id={id}
        rows={4}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={limit}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
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

      <p className={`text-xs ${dirty ? "font-medium text-clay" : "text-fg-faint"}`}>
        {value.length}/{limit}
        {dirty ? " · not saved yet" : base.at ? ` · saved ${formatPacific(base.at)} by ${nameOf(base.by)}` : ""}
        {!dirty && base.at && Date.parse(base.at) >= Date.parse(closesAt) && <span className="font-medium text-clay"> · after the deadline</span>}
      </p>
    </div>
  );
}

// "Who did what": a section per teammate, inside the entry form so its one Save covers it. Anyone
// on the team can write any teammate's part and add a missing GitHub username; each part is saved
// on its own, so nobody overwrites anyone else's.
export function Contributions({
  ref,
  teamId,
  teammates,
  me,
  closesAt,
  disabled,
  legacy,
  limit,
  githubAction,
  onDirty,
}: {
  ref: Ref<ContributionsHandle>;
  teamId: string;
  teammates: Teammate[];
  me: string;
  // Parts saved after this are marked late; they stay editable (no hard stop on submissions).
  closesAt: string;
  // While the form is saving.
  disabled: boolean;
  // The shared "who did what" written before each teammate had their own part.
  legacy: string;
  limit: number;
  githubAction: (formData: FormData) => Promise<PartState>;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  // Saves this page has seen since it loaded, from polling and from its own saves.
  const [seen, setSeen] = useState<Map<string, Part>>(() => new Map());
  const editors = useRef(new Map<string, PartHandle>());
  const partOf = (t: Teammate) => newer(t.part, seen.get(t.id));
  const nameOf = (id: string | null) => (id === me ? "you" : (teammates.find((t) => t.id === id)?.name ?? "a teammate"));

  useImperativeHandle(ref, () => ({
    collect: () => [...editors.current.values()].map((editor) => editor.edit()).filter((edit): edit is PartEdit => Boolean(edit)),
    apply: (results) => {
      for (const result of results) editors.current.get(result.profile_id)?.apply(result);
    },
  }));

  // Reads run as the user in the browser, so they cost no server calls; RLS limits them to the team.
  const poll = useEffectEvent(async () => {
    if (document.hidden) return;
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
    <section className="space-y-4 pt-5" aria-labelledby="contributions-heading">
      <div className="space-y-1">
        <h2 id="contributions-heading" className="text-lg font-medium">
          Who did what
        </h2>
        <p className="text-sm text-fg-muted">
          Judges score teamwork. Write what each person did: anyone on the team can fill in any section, or all of them. Business, design, research, and pitch work count
          as much as code.
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
                  // Hover or keyboard focus shows where the username is changed. A tap on a phone
                  // opens GitHub, as the tag is a link.
                  <span className="group relative inline-flex">
                    <a
                      href={`https://github.com/${t.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-describedby={`github-tip-${t.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black px-2 py-0.5 font-mono text-xs text-white no-underline hover:bg-neutral-800"
                    >
                      <GitHubMark />@{t.github}
                    </a>
                    <span
                      role="tooltip"
                      id={`github-tip-${t.id}`}
                      className="absolute bottom-full left-0 z-50 mb-2 hidden w-64 max-w-[calc(100vw-2rem)] rounded border border-line-strong bg-bg-raised p-2 text-xs text-fg shadow-lg group-focus-within:block group-hover:block"
                    >
                      {githubTip(t, mine)}
                    </span>
                  </span>
                )}
              </div>

              {!t.github && <AddGithub teammate={t} action={githubAction} />}

              <PartEditor
                ref={(editor) => {
                  if (editor) editors.current.set(t.id, editor);
                  else editors.current.delete(t.id);
                }}
                teammate={t}
                remote={part}
                mine={mine}
                nameOf={nameOf}
                limit={limit}
                disabled={disabled}
                closesAt={closesAt}
                onDirty={onDirty}
                onSaved={(saved) => setSeen((prev) => new Map(prev).set(t.id, saved))}
              />
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
