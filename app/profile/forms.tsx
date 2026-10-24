"use client";

import { startTransition, Suspense, use, useActionState, useEffect, useState } from "react";
import { ROLE_LABEL, type RoleBucket } from "@/lib/roles";
import { TECHNICAL_LEVELS } from "@/lib/technical-levels";
import { addEmail, makeDefaultEmail, saveProfile, type FormState } from "./actions";

const input = "w-full rounded border border-foreground/20 bg-background px-3 py-2";
const button = "rounded bg-foreground px-4 py-2 text-background disabled:opacity-50";
const idle: FormState = { status: "idle" };

function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p className={`text-sm ${state.status === "error" ? "text-red-600" : "text-green-700"}`} role="status">
      {state.message}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export type ProfileValues = {
  first_name: string;
  last_name: string;
  role_bucket: string | null;
  technical_level: number | null;
  job_title: string | null;
  company: string | null;
  linkedin_url: string | null;
  github_username: string | null;
  claude_code_level: string | null;
  bio: string | null;
  interests: string | null;
  looking_for: string | null;
  profile_confirmed: boolean;
  public_profile: boolean;
};

// From the person's own LinkedIn enrichment, for fields they left empty (lib/linkedin-prefill.ts).
type Prefill = { job_title: string | null; company: string | null; bio: string | null };

// A text input that offers a LinkedIn value when it's empty; nothing changes until they accept.
function PrefillInput({ name, value, suggestion, maxLength }: { name: string; value: string | null; suggestion: string | null; maxLength?: number }) {
  const [text, setText] = useState(value ?? "");
  const offer = !value && suggestion && text !== suggestion ? suggestion : null;
  return (
    <>
      <input name={name} maxLength={maxLength} value={text} onChange={(e) => setText(e.target.value)} className={input} />
      {offer && (
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground/70">
          <span>
            From your LinkedIn: <span className="text-foreground">{offer}</span>
          </span>
          <button type="button" onClick={() => setText(offer)} className="underline">
            Use this
          </button>
        </span>
      )}
    </>
  );
}

// Waits for Claude's suggestion and preselects it, unless they already picked a level.
function Suggestion({ promise, onSuggest }: { promise: Promise<number | null>; onSuggest: (level: number) => void }) {
  const level = use(promise);
  useEffect(() => {
    if (level != null) onSuggest(level);
  }, [level, onSuggest]);
  if (level == null) return null;
  return (
    <p className="text-sm text-foreground/70">
      Suggested from your registration and LinkedIn: {level}. Adjust it if it&apos;s off.
    </p>
  );
}

function TechnicalLevel({ saved, suggestedLevel }: { saved: number | null; suggestedLevel: Promise<number | null> }) {
  const [level, setLevel] = useState<number | null>(saved);
  // Stable, and never replaces a level they already picked.
  const [onSuggest] = useState(() => (suggested: number) => setLevel((current) => current ?? suggested));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">How hands-on are you with code?</legend>
      <p className="text-sm text-foreground/70">
        Others never see the number. Team pages show you as technical at 3 or higher.
      </p>
      {saved == null && (
        <Suspense fallback={<p className="text-sm text-foreground/70">Getting a suggestion from your registration…</p>}>
          <Suggestion promise={suggestedLevel} onSuggest={onSuggest} />
        </Suspense>
      )}
      <div className="space-y-1.5">
        {TECHNICAL_LEVELS.map((t) => (
          <label key={t.level} className="flex items-start gap-2">
            <input
              type="radio"
              name="technical_level"
              value={t.level}
              required
              checked={level === t.level}
              onChange={() => setLevel(t.level)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t.level}</span> <span className="text-foreground/80">{t.label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfileForm({
  profile,
  suggestedLevel,
  linkedin,
}: {
  profile: ProfileValues;
  suggestedLevel: Promise<number | null>;
  linkedin: Prefill;
}) {
  const [state, formAction, pending] = useActionState(saveProfile, idle);

  return (
    <form
      // Submit by hand instead of action={...}: React resets a form after its action runs,
      // which would wipe what the person typed when saving fails.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-4"
    >
      {!profile.profile_confirmed && <input type="hidden" name="first_confirm" value="yes" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input name="first_name" required defaultValue={profile.first_name} className={input} />
        </Field>
        <Field label="Last name">
          <input name="last_name" required defaultValue={profile.last_name} className={input} />
        </Field>
      </div>
      <Field label="Which best describes you?">
        <select name="role_bucket" required defaultValue={profile.role_bucket ?? ""} className={input}>
          <option value="" disabled>
            Choose one
          </option>
          {(Object.keys(ROLE_LABEL) as RoleBucket[]).map((bucket) => (
            <option key={bucket} value={bucket}>
              {ROLE_LABEL[bucket]}
            </option>
          ))}
        </select>
      </Field>
      <TechnicalLevel saved={profile.technical_level} suggestedLevel={suggestedLevel} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <PrefillInput name="job_title" value={profile.job_title} suggestion={linkedin.job_title} />
        </Field>
        <Field label="Company or school">
          <PrefillInput name="company" value={profile.company} suggestion={linkedin.company} />
        </Field>
        <Field label="LinkedIn URL">
          <input name="linkedin_url" placeholder="linkedin.com/in/your-name" defaultValue={profile.linkedin_url ?? ""} className={input} />
        </Field>
        <Field label="GitHub username">
          <input name="github_username" placeholder="your-username" defaultValue={profile.github_username ?? ""} className={input} />
        </Field>
      </div>
      <Field label="Experience with Claude Code">
        <input
          name="claude_code_level"
          maxLength={200}
          placeholder="For example: never used it, tried it, use it every day"
          defaultValue={profile.claude_code_level ?? ""}
          className={input}
        />
      </Field>
      <Field label="One-line bio">
        <PrefillInput name="bio" maxLength={300} value={profile.bio} suggestion={linkedin.bio} />
      </Field>
      <Field label="Interests">
        <textarea name="interests" maxLength={500} rows={2} defaultValue={profile.interests ?? ""} className={input} />
      </Field>
      <Field label="What I'm looking for">
        <textarea name="looking_for" maxLength={500} rows={3} defaultValue={profile.looking_for ?? ""} className={input} />
      </Field>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="public_profile" defaultChecked={profile.public_profile} className="mt-1" />
        <span className="text-sm">
          Show my full name, title, company, and LinkedIn on public team pages. If you leave this off, people who
          aren&apos;t logged in see only your first name and last initial.
        </span>
      </label>
      <Status state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving…" : profile.profile_confirmed ? "Save" : "Confirm profile"}
      </button>
    </form>
  );
}

export function AddEmailForm() {
  const [state, formAction, pending] = useActionState(addEmail, idle);
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <input type="email" name="email" required placeholder="another@example.com" className={input} />
        <button type="submit" disabled={pending} className={`${button} shrink-0`}>
          {pending ? "Sending…" : "Add email"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

// Sends a verification link to an email already listed on the account (e.g. the Claude
// account email from Luma), so it can sign in.
export function VerifyEmailButton({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(addEmail, idle);
  if (state.status === "ok") return <span className="text-sm text-green-700">Link sent</span>;
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="email" value={email} />
      <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
        {pending ? "Sending…" : "Verify"}
      </button>
      {state.status === "error" && <span className="ml-2 text-sm text-red-600">{state.message}</span>}
    </form>
  );
}

export function MakeDefaultButton({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(makeDefaultEmail, idle);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="email" value={email} />
      <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
        Make default
      </button>
      {state.status === "error" && <span className="ml-2 text-sm text-red-600">{state.message}</span>}
    </form>
  );
}
