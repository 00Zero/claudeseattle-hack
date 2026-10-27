"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CAME_TRACKS, OTHER, gateFor, isAnswered, questionsFor, trackFor, type Answers, type Group, type Question, type Role } from "@/lib/followup/survey";
import { submitSurvey } from "./actions";

type Detail = Answers["detail"];

// One answer as a row of pills. Real radio or checkbox inputs underneath, so keyboards and screen readers work.
function Pills({ name, options, type, selected, onChange }: { name: string; options: string[]; type: "radio" | "checkbox"; selected: string[]; onChange: (value: string, checked: boolean) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <label
            key={option}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-accent ${
              on ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
            }`}
          >
            <input type={type} name={name} value={option} checked={on} onChange={(e) => onChange(option, e.target.checked)} className="sr-only" />
            {option}
          </label>
        );
      })}
    </div>
  );
}

// Whole dollars per hour, up to 3 digits. Other characters are dropped. After a "." or "," the digits typed
// next are ignored until something is deleted, so "85.50" stays 85 rather than 855; a pasted "$75" or
// "12.50" becomes 75 or 12. Works from the input events, since phone keyboards don't report key names.
function DollarsInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const afterPoint = useRef(false);
  return (
    <span className="flex items-center gap-2">
      <span className="text-fg-muted">$</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const input = e.nativeEvent as InputEvent;
          if (input.inputType?.startsWith("delete")) afterPoint.current = false;
          if (/[.,]/.test(raw)) afterPoint.current = true;
          else if (afterPoint.current && input.inputType === "insertText") return; // digits after the point
          onChange(raw.split(/[.,]/)[0].replace(/\D/g, "").slice(0, 3));
        }}
        className="w-24 rounded border border-line bg-bg px-3 py-2 tabular-nums"
      />
      <span className="text-fg-muted">per hour</span>
    </span>
  );
}

function Field({ q, value, onChange, number }: { q: Question; value: Detail[string] | undefined; onChange: (value: Detail[string]) => void; number?: number }) {
  const label = (
    <legend className="mb-2 font-medium">
      {number != null && <span className="mr-2 font-mono text-sm text-fg-faint">{number}.</span>}
      {q.label}
    </legend>
  );
  if (q.kind === "dollars") {
    return (
      <label className="block space-y-2">
        <span className="block font-medium">{q.label}</span>
        <DollarsInput value={typeof value === "string" ? value : ""} onChange={onChange} />
      </label>
    );
  }
  if (q.kind === "text") {
    return (
      <label className="block space-y-2">
        <span className="block font-medium">{q.label}</span>
        <textarea
          rows={3}
          maxLength={4000}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-line bg-bg px-3 py-2"
        />
      </label>
    );
  }
  if (q.kind === "choice") {
    return (
      <fieldset>
        {label}
        <Pills name={q.id} type="radio" options={q.options} selected={typeof value === "string" ? [value] : []} onChange={(v) => onChange(v)} />
      </fieldset>
    );
  }
  if (q.kind === "multi") {
    const picked = Array.isArray(value) ? value : [];
    const otherText = picked.find((p) => p.startsWith(OTHER));
    const options = [...q.options, ...(q.other ? ["Other"] : []), ...(q.none ? [q.none] : [])];
    const selected = [...picked.filter((p) => !p.startsWith(OTHER)), ...(otherText != null ? ["Other"] : [])];
    // "None" clears the rest; anything else clears "None". "Other" keeps its text in the answer.
    const toggle = (v: string, checked: boolean) => {
      if (!checked) return onChange(picked.filter((p) => (v === "Other" ? !p.startsWith(OTHER) : p !== v)));
      if (v === q.none) return onChange([v]);
      const rest = picked.filter((p) => p !== q.none);
      onChange([...rest, v === "Other" ? OTHER : v]);
    };
    return (
      <fieldset>
        {label}
        <p className="-mt-1 mb-2 text-sm text-fg-faint">Pick any.</p>
        <Pills name={q.id} type="checkbox" options={options} selected={selected} onChange={toggle} />
        {otherText != null && (
          <input
            type="text"
            maxLength={200}
            autoFocus
            aria-label={`${q.label} Other`}
            placeholder="Which ones?"
            value={otherText.slice(OTHER.length)}
            onChange={(e) => onChange(picked.map((p) => (p.startsWith(OTHER) ? `${OTHER}${e.target.value}` : p)))}
            className="mt-2 w-full max-w-sm rounded border border-line bg-bg px-3 py-1.5 text-sm"
          />
        )}
      </fieldset>
    );
  }
  const rows = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return (
    <fieldset>
      {label}
      <div className="space-y-3">
        {q.rows.map((row) => (
          <div key={row} className="space-y-1.5">
            <p className="text-sm">{row}</p>
            <Pills name={`${q.id}:${row}`} type="radio" options={q.options} selected={rows[row] ? [rows[row]] : []} onChange={(v) => onChange({ ...rows, [row]: v })} />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function SurveyForm({
  token,
  firstName,
  group,
  role,
  happyHour,
  owner,
  signInEmail,
  previous,
  answeredAt,
}: {
  token: string | null; // null: an admin preview, nothing is saved
  firstName: string | null;
  group: Group;
  role: Role;
  happyHour: boolean;
  owner: boolean; // a business owner or founder: the hiring version of the contract question
  signInEmail: string | null; // their account's sign-in email, when it isn't the one this survey was sent to
  previous: Answers | null;
  answeredAt: string | null;
}) {
  const gate = gateFor(group);
  const [came, setCame] = useState<string | undefined>(previous?.came);
  const [quick, setQuick] = useState<Answers["quick"]>(previous?.quick ?? {});
  const [more, setMore] = useState<boolean | null>(previous ? previous.more : null);
  const [detail, setDetail] = useState<Detail>(previous?.detail ?? {});
  const [additional, setAdditional] = useState(previous?.additional ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const track = trackFor(group, role, came);
  const questions = track ? questionsFor(track, role, { happyHour, owner }) : null;
  const quickDone = Boolean(questions && questions.quick.every((q) => isAnswered(q, quick[q.id])));

  async function submit() {
    if (!track || !quickDone || more === null) return;
    setError(null);
    if (!token) {
      setStatus("done");
      return;
    }
    setStatus("saving");
    const result = await submitSurvey(token, { came, quick, more, detail: more ? detail : {}, additional: more ? undefined : additional });
    if (result.ok) setStatus("done");
    else {
      setStatus("idle");
      setError(result.message);
    }
  }

  if (status === "done") {
    const cameToEvent = track ? CAME_TRACKS.includes(track) : false;
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <p className="eyebrow text-accent">Claude Impact Lab Hackathon</p>
        <h1 className="font-display text-5xl font-light leading-tight">Thank you{firstName ? `, ${firstName}` : ""}.</h1>
        {!token && <p className="rounded border border-line bg-bg-raised px-3 py-2 text-sm text-fg-muted">Preview: nothing was saved.</p>}
        <p className="text-fg-muted">We read every answer, and they shape the next Seattle Claude events.</p>
        {cameToEvent && (
          <div className="space-y-3 rounded-lg border border-line bg-bg-raised p-5">
            <p className="font-medium">Share your photos/videos from the event</p>
            <p className="text-sm text-fg-muted">
              Upload them on the Resources page. If you aren&apos;t signed in, sign in with{" "}
              {signInEmail ? (
                <>
                  your account&apos;s email, <strong>{signInEmail}</strong>
                </>
              ) : (
                "the email address this survey was sent to"
              )}
              .
            </p>
            <Link href={token ? `/login?next=/resources&invite=${token}` : "/login?next=/resources"} className="btn">
              Upload photos and videos
            </Link>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href="/results" className="btn btn-ghost">
            See every project
          </Link>
          <a href="https://luma.com/adamburgh" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            Upcoming events
          </a>
        </div>
      </div>
    );
  }

  // People who came answer the long version; everyone else a few questions.
  const cameTrack = track ? CAME_TRACKS.includes(track) : group === "attended" || group === "crew";
  const quickTime = cameTrack ? "about 3 minutes" : "about a minute";
  const moreTime = cameTrack ? "about 5 more minutes" : "about a minute more";

  let n = 0;
  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-3">
        <p className="eyebrow text-accent">Claude Impact Lab Hackathon · feedback</p>
        <h1 className="font-display text-[clamp(2.2rem,5vw,3.2rem)] font-light leading-[1.05]">
          {firstName ? `Hi ${firstName}, ` : ""}
          <em className="text-fg-muted">how did it go?</em>
        </h1>
        <p className="text-fg-muted">
          We experimented with a lot of different concepts of this hackathon and would love your input to understand which ones to keep, remove, or improve.
        </p>
        {group === "standby" && (
          <p className="text-fg-muted">
            We&apos;re always looking for creative ways to admit as many people as possible, and standby was an experiment, so we&apos;d love your
            feedback.
          </p>
        )}
        <p className="text-fg-muted">A few quick questions first, {quickTime}. Then you choose whether to say more.</p>
        {!token && <p className="rounded border border-line bg-bg-raised px-3 py-2 text-sm text-fg-muted">Preview of what this group sees ({group}, {role}). Nothing is saved.</p>}
        {answeredAt && (
          <p className="rounded border border-line bg-bg-raised px-3 py-2 text-sm text-fg-muted">
            You already answered. Your answers are below; sending again replaces them.
          </p>
        )}
      </header>

      <section className="space-y-7">
        {gate && <Field q={gate} number={++n} value={came} onChange={(v) => setCame(v as string)} />}
        {questions?.quick.map((q) => (
          <Field key={q.id} q={q} number={++n} value={quick[q.id]} onChange={(v) => setQuick({ ...quick, [q.id]: v as Answers["quick"][string] })} />
        ))}
      </section>

      {questions && (
        <section className="space-y-5 border-t border-line pt-8">
          <p className="font-medium">Want to tell us more? It&apos;s optional, {moreTime}.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setMore(true)} className={`btn ${more === true ? "" : "btn-ghost"}`} aria-pressed={more === true}>
              Yes, I&apos;ll say more
            </button>
            <button type="button" onClick={() => setMore(false)} className={`btn ${more === false ? "" : "btn-ghost"}`} aria-pressed={more === false}>
              No, I&apos;m done
            </button>
          </div>
          {more === true && (
            <div className="space-y-7 pt-2">
              {questions.detail.map((q) => (
                <Field key={q.id} q={q} value={detail[q.id]} onChange={(v) => setDetail({ ...detail, [q.id]: v })} />
              ))}
            </div>
          )}
          {more === false && (
            <label className="block space-y-2">
              <span className="block font-medium">Any additional feedback?</span>
              <textarea rows={4} maxLength={4000} value={additional} onChange={(e) => setAdditional(e.target.value)} className="w-full rounded border border-line bg-bg px-3 py-2" />
            </label>
          )}
        </section>
      )}

      <div className="space-y-3 border-t border-line pt-6">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!quickDone && <p className="text-sm text-fg-faint">Answer the questions above to send.</p>}
        {quickDone && more === null && <p className="text-sm text-fg-faint">Choose whether to say more, then send.</p>}
        <button type="button" onClick={submit} disabled={!quickDone || more === null || status === "saving"} className="btn disabled:opacity-40">
          {status === "saving" ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </div>
  );
}
