"use client";

import { useRef, useState, useTransition } from "react";
import {
  ANSWER_MAX,
  CLAUDE_PLUGIN,
  CLAUDE_PLUGIN_ID,
  EMAIL,
  FIELDS,
  INDUSTRIES,
  inputProblem,
  LABELS,
  TEAM_SIZES,
  type BusinessInput,
  type FollowUp,
} from "@/lib/small-business-options";
import { askFollowUps, findMatches, type MatchedProject } from "./actions";
import { ProjectCard } from "./project-card";

// "email": asked for after the free searches, before the next one goes ahead.
type Step = "business" | "challenges" | "email" | "questions" | "results";

const STEPS: { key: Step; label: string }[] = [
  { key: "business", label: "Your business" },
  { key: "challenges", label: "Challenges" },
  { key: "questions", label: "A few questions" },
  { key: "results", label: "Your matches" },
];

const EMPTY: BusinessInput = { name: "", email: "", website: "", industry: "", size: "", tools: "", about: "", challenges: "", opportunities: "" };

// Hints under a field's label; fields without one show just the label.
const HINTS: Partial<Record<keyof BusinessInput, string>> = {
  email: "So we can follow up about the tools. Needed if you search more than once.",
  about: "What you sell or do, who your customers are, and how they find you and buy from you.",
  challenges: "What eats your time, what you keep putting off, where you lose customers or money.",
  opportunities: "Anything you've wondered about, tried, or worried about with AI. It's fine to say you don't know yet.",
};

const OTHER = "Other";

const inputClass = "w-full rounded border border-line bg-bg px-3 py-2";
const hint = "block text-sm text-fg-muted";

// The finder: business details, then challenges and opportunities, then up to three follow-up
// questions Claude writes from those answers (each with "Other"), then the matching projects with
// how each could help. Claude for Small Business is always offered too. Which fields are required
// is set in lib/small-business-options.ts (FIELDS); the server checks the same rules.
export function Finder() {
  const [step, setStep] = useState<Step>("business");
  const [form, setForm] = useState<BusinessInput>(EMPTY);
  const [questions, setQuestions] = useState<FollowUp[]>([]);
  // Per question: the chosen option, or OTHER with the typed text in `other`.
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [other, setOther] = useState<Record<number, string>>({});
  const [matches, setMatches] = useState<MatchedProject[] | null>(null);
  // What to run once the visitor has added their email.
  const [afterEmail, setAfterEmail] = useState<"ask" | "match">("ask");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const top = useRef<HTMLDivElement>(null);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const field = (key: keyof BusinessInput, control: (props: { id: string; value: string; required: boolean; maxLength: number; onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void }) => React.ReactNode, className = "") => {
    const { mode, max } = FIELDS[key];
    if (mode === "hidden") return null;
    const id = `sb-${key}`;
    return (
      <div className={`space-y-1.5 ${className}`}>
        <label htmlFor={id} className="block font-medium">
          {LABELS[key]}
          {mode === "optional" && <span className="font-normal text-fg-muted"> (optional)</span>}
        </label>
        {HINTS[key] && <span className={hint}>{HINTS[key]}</span>}
        {control({ id, value: form[key], required: mode === "required", maxLength: max, onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })) })}
      </div>
    );
  };

  const answers = () =>
    questions.map((q, i) => ({ question: q.question, answer: choices[i] === OTHER ? (other[i] ?? "").trim() : (choices[i] ?? "") }));

  const match = (qs: FollowUp[], chosen: { question: string; answer: string }[]) =>
    startTransition(async () => {
      const result = await findMatches(form, qs.length ? chosen : []);
      if (!result.ok) {
        if (result.needEmail) {
          setAfterEmail("match");
          return go("email");
        }
        return setError(result.error);
      }
      setMatches(result.matches);
      go("results");
    });

  const ask = () =>
    startTransition(async () => {
      const result = await askFollowUps(form);
      if (!result.ok) {
        if (result.needEmail) {
          setAfterEmail("ask");
          return go("email");
        }
        return setError(result.error);
      }
      setQuestions(result.questions);
      setChoices({});
      setOther({});
      if (result.questions.length === 0) return match([], []);
      go("questions");
    });

  const restart = () => {
    // Keep the email: they've already given it.
    setForm({ ...EMPTY, email: form.email });
    setQuestions([]);
    setChoices({});
    setOther({});
    setMatches(null);
    go("business");
  };

  const index = STEPS.findIndex((s) => s.key === (step === "email" ? "questions" : step));

  return (
    <div ref={top} className="scroll-mt-20 space-y-6 rounded-lg border border-line p-4 sm:p-6">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i === index ? "text-fg" : i < index ? "text-fg-muted" : "text-fg-faint"} aria-current={i === index ? "step" : undefined}>
            <span className="text-accent">{i < index ? "✓" : `${i + 1}.`}</span> {s.label}
          </li>
        ))}
      </ol>

      {step === "business" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = inputProblem(form, [1]);
            if (problem) return setError(problem);
            go("challenges");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", (p) => <input {...p} className={inputClass} autoComplete="organization" />)}
            {field("website", (p) => <input {...p} type="text" inputMode="url" placeholder="example.com" className={inputClass} autoComplete="url" />)}
            {field("industry", (p) => (
              <select id={p.id} value={p.value} required={p.required} onChange={p.onChange} className={inputClass}>
                <option value="">Choose one</option>
                {INDUSTRIES.map((i) => (
                  <option key={i}>{i}</option>
                ))}
                <option>Other</option>
              </select>
            ))}
            {field("size", (p) => (
              <select id={p.id} value={p.value} required={p.required} onChange={p.onChange} className={inputClass}>
                <option value="">Choose one</option>
                {TEAM_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ))}
            {field("tools", (p) => <input {...p} placeholder="Gmail, Square, QuickBooks, Instagram…" className={inputClass} />, "sm:col-span-2")}
          </div>
          {field("about", (p) => <textarea {...p} rows={5} className={inputClass} />)}
          {field("email", (p) => <input {...p} type="email" className={`${inputClass} sm:max-w-sm`} autoComplete="email" />)}
          <button type="submit" className="btn">
            Next: challenges
          </button>
        </form>
      )}

      {step === "challenges" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = inputProblem(form, [2]);
            if (problem) return setError(problem);
            ask();
          }}
        >
          {field("challenges", (p) => <textarea {...p} rows={5} className={inputClass} />)}
          {field("opportunities", (p) => <textarea {...p} rows={4} className={inputClass} />)}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Thinking…" : "Next"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => go("business")} disabled={pending}>
              Back
            </button>
          </div>
        </form>
      )}

      {step === "email" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!EMAIL.test(form.email.trim())) return setError("That email address doesn't look right.");
            setError(null);
            if (afterEmail === "ask") ask();
            else match(questions, answers());
          }}
        >
          <p>To keep searching, tell us how to reach you. We&apos;ll only use it to follow up about the tools.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="sb-gate-email" className="block font-medium">
                Email
              </label>
              <input
                id="sb-gate-email"
                type="email"
                required
                maxLength={FIELDS.email.max}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
                autoComplete="email"
              />
            </div>
            {FIELDS.name.mode !== "hidden" && (
              <div className="space-y-1.5">
                <label htmlFor="sb-gate-name" className="block font-medium">
                  Business name{FIELDS.name.mode === "optional" && <span className="font-normal text-fg-muted"> (optional)</span>}
                </label>
                <input
                  id="sb-gate-name"
                  required={FIELDS.name.mode === "required"}
                  maxLength={FIELDS.name.max}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  autoComplete="organization"
                />
              </div>
            )}
          </div>
          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Thinking…" : "Continue"}
          </button>
        </form>
      )}

      {step === "questions" && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            match(questions, answers());
          }}
        >
          <p className="text-fg-muted">A few quick questions to narrow it down. Skip any you&apos;re not sure about.</p>
          {questions.map((q, i) => (
            <fieldset key={q.question} className="space-y-2">
              <legend className="font-medium">{q.question}</legend>
              <div className="flex flex-wrap gap-2">
                {[...q.options, OTHER].map((option) => {
                  const chosen = choices[i] === option;
                  return (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${chosen ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:bg-fg/5"}`}
                    >
                      <input
                        type="radio"
                        name={`q${i}`}
                        value={option}
                        checked={chosen}
                        onChange={() => setChoices((c) => ({ ...c, [i]: option }))}
                        className="sr-only"
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
              {choices[i] === OTHER && (
                <input
                  aria-label={`Your answer: ${q.question}`}
                  value={other[i] ?? ""}
                  onChange={(e) => setOther((o) => ({ ...o, [i]: e.target.value }))}
                  maxLength={ANSWER_MAX}
                  placeholder="Type your answer"
                  autoFocus
                  className={`${inputClass} sm:max-w-md`}
                />
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Finding tools…" : "Show my matches"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => go("challenges")} disabled={pending}>
              Back
            </button>
          </div>
        </form>
      )}

      {step === "results" && matches && (
        <div className="space-y-5">
          {matches.length === 0 ? (
            <p>None of the tools is a close fit for what you described. Claude for Small Business below may still help, or browse every tool further down.</p>
          ) : (
            <p className="text-fg-muted">
              {matches.length === 1 ? "This is" : `These ${matches.length} are`} the best fit for what you told us, best first. Every tool is free and open source: the
              GitHub repo has the code and setup instructions, and the submission page has a demo video.
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {matches.map((m) => (
              <li key={m.id}>
                <ProjectCard project={m} fit={m.fit} reason={m.reason} />
              </li>
            ))}
          </ul>
          {!matches.some((m) => m.id === CLAUDE_PLUGIN_ID) && (
            <div className="space-y-3">
              <h3 className="font-medium">Also an option: Anthropic&apos;s own plugin</h3>
              <div className="sm:max-w-[calc(50%-0.375rem)]">
                <ProjectCard project={CLAUDE_PLUGIN} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-ghost" onClick={() => go(questions.length ? "questions" : "challenges")}>
              Change my answers
            </button>
            <button type="button" className="btn btn-ghost" onClick={restart}>
              Start over
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="status" className="text-sm text-accent">
          {error}
        </p>
      )}
      <p className="font-mono text-xs text-fg-faint">
        Your answers are sent to Claude to find matches and saved so the Seattle Claude community organizers can see what small businesses need. We won&apos;t share them
        outside the organizers without your approval.
      </p>
    </div>
  );
}
