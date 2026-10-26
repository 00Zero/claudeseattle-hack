"use client";

import { useRef, useState, useTransition } from "react";
import { CLAUDE_PLUGIN, CLAUDE_PLUGIN_ID, INDUSTRIES, LIMITS, TEAM_SIZES, type BusinessInput, type FollowUp } from "@/lib/small-business-options";
import { askFollowUps, findMatches, type MatchedProject } from "./actions";
import { ProjectCard } from "./project-card";

type Step = "business" | "challenges" | "questions" | "results";

const STEPS: { key: Step; label: string }[] = [
  { key: "business", label: "Your business" },
  { key: "challenges", label: "Challenges" },
  { key: "questions", label: "A few questions" },
  { key: "results", label: "Your matches" },
];

const EMPTY: BusinessInput = { name: "", industry: "", size: "", tools: "", about: "", challenges: "", opportunities: "" };

const input = "w-full rounded border border-line bg-bg px-3 py-2";
const label = "block space-y-1.5";
const hint = "block text-sm text-fg-muted";

// The finder: business details, then challenges and opportunities, then up to three follow-up
// questions Claude writes from those answers, then the matching projects with why each fits.
// Claude for Small Business is always offered too.
export function Finder() {
  const [step, setStep] = useState<Step>("business");
  const [form, setForm] = useState<BusinessInput>(EMPTY);
  const [questions, setQuestions] = useState<FollowUp[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [matches, setMatches] = useState<MatchedProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const top = useRef<HTMLDivElement>(null);

  const set = (key: keyof BusinessInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const go = (next: Step) => {
    setError(null);
    setStep(next);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const match = (qs: FollowUp[], chosen: Record<number, string>) =>
    startTransition(async () => {
      const result = await findMatches(
        form,
        qs.map((q, i) => ({ question: q.question, answer: chosen[i] ?? "" })),
      );
      if (!result.ok) return setError(result.error);
      setMatches(result.matches);
      go("results");
    });

  const ask = () =>
    startTransition(async () => {
      const result = await askFollowUps(form);
      if (!result.ok) return setError(result.error);
      setQuestions(result.questions);
      setAnswers({});
      if (result.questions.length === 0) return match([], {});
      go("questions");
    });

  const restart = () => {
    setForm(EMPTY);
    setQuestions([]);
    setAnswers({});
    setMatches(null);
    go("business");
  };

  const index = STEPS.findIndex((s) => s.key === step);

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
            go("challenges");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              <span className="font-medium">Business name (optional)</span>
              <input value={form.name} onChange={set("name")} maxLength={LIMITS.name} className={input} autoComplete="organization" />
            </label>
            <label className={label}>
              <span className="font-medium">Industry</span>
              <select value={form.industry} onChange={set("industry")} className={input}>
                <option value="">Choose one</option>
                {INDUSTRIES.map((i) => (
                  <option key={i}>{i}</option>
                ))}
                <option>Other</option>
              </select>
            </label>
            <label className={label}>
              <span className="font-medium">How many people work there?</span>
              <select value={form.size} onChange={set("size")} className={input}>
                <option value="">Choose one</option>
                {TEAM_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span className="font-medium">Tools you use today (optional)</span>
              <input value={form.tools} onChange={set("tools")} maxLength={LIMITS.tools} placeholder="Gmail, Square, QuickBooks, Instagram…" className={input} />
            </label>
          </div>
          <label className={label}>
            <span className="font-medium">Describe your business</span>
            <span className={hint}>What you sell or do, who your customers are, and how they find you and buy from you.</span>
            <textarea value={form.about} onChange={set("about")} rows={5} maxLength={LIMITS.about} required className={input} />
          </label>
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
            if (!form.challenges.trim() && !form.opportunities.trim()) return setError("Fill in at least one of the two.");
            ask();
          }}
        >
          <label className={label}>
            <span className="font-medium">What are your biggest challenges?</span>
            <span className={hint}>What eats your time, what you keep putting off, where you lose customers or money.</span>
            <textarea value={form.challenges} onChange={set("challenges")} rows={5} maxLength={LIMITS.challenges} className={input} />
          </label>
          <label className={label}>
            <span className="font-medium">Where could AI help?</span>
            <span className={hint}>Anything you&apos;ve wondered about, tried, or worried about with AI. It&apos;s fine to say you don&apos;t know yet.</span>
            <textarea value={form.opportunities} onChange={set("opportunities")} rows={4} maxLength={LIMITS.opportunities} className={input} />
          </label>
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

      {step === "questions" && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            match(questions, answers);
          }}
        >
          <p className="text-fg-muted">A few quick questions to narrow it down. Skip any you&apos;re not sure about.</p>
          {questions.map((q, i) => (
            <fieldset key={q.question} className="space-y-2">
              <legend className="font-medium">{q.question}</legend>
              <div className="flex flex-wrap gap-2">
                {q.options.map((option) => {
                  const chosen = answers[i] === option;
                  return (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${chosen ? "border-accent bg-accent text-accent-fg" : "border-line-strong hover:bg-fg/5"}`}
                    >
                      <input
                        type="radio"
                        name={`q${i}`}
                        value={option}
                        checked={chosen}
                        onChange={() => setAnswers((a) => ({ ...a, [i]: option }))}
                        className="sr-only"
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Finding projects…" : "Show my matches"}
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
            <p>None of the projects is a close fit for what you described. Claude for Small Business below may still help, or browse every project further down.</p>
          ) : (
            <p className="text-fg-muted">
              {matches.length === 1 ? "This is" : `These ${matches.length} are`} the best fit for what you told us, best first. Every hackathon project is free and open source: the
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
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
      <p className="font-mono text-xs text-fg-faint">What you type is sent to Claude to find matches and isn&apos;t stored.</p>
    </div>
  );
}
