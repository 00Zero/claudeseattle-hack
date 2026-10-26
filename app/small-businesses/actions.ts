"use server";

import { cleanInput, getFollowUps, getMatches, getProjects, type Match } from "@/lib/small-business";
import { CLAUDE_PLUGIN, LIMITS, type BusinessInput, type FollowUp, type FollowUpAnswer, type Project } from "@/lib/small-business-options";

// The finder on /small-businesses. Public: anyone can use it, and nothing they type is stored.
// Each step reads the catalog itself (summaries are cached in lib/small-business.ts).

type Fail = { ok: false; error: string };

const INCOMPLETE: Fail = { ok: false, error: "Tell us about your business and at least one challenge or opportunity." };
const UNAVAILABLE: Fail = { ok: false, error: "Matching isn't available right now. Browse every project below instead." };

export async function askFollowUps(raw: Partial<Record<keyof BusinessInput, unknown>>): Promise<{ ok: true; questions: FollowUp[] } | Fail> {
  const input = cleanInput(raw);
  if (!input) return INCOMPLETE;
  const projects = await getProjects();
  if (projects.length === 0) return { ok: false, error: "The projects aren't published yet. Check back after the hackathon." };
  const questions = await getFollowUps(input, projects);
  // Questions are optional: without them the finder goes straight to matching.
  return { ok: true, questions: questions ?? [] };
}

export type MatchedProject = Project & Pick<Match, "fit" | "reason">;

export async function findMatches(
  raw: Partial<Record<keyof BusinessInput, unknown>>,
  rawAnswers: unknown,
): Promise<{ ok: true; matches: MatchedProject[] } | Fail> {
  const input = cleanInput(raw);
  if (!input) return INCOMPLETE;
  const answers: FollowUpAnswer[] = (Array.isArray(rawAnswers) ? rawAnswers : [])
    .slice(0, 3)
    .map((a) => ({
      question: typeof a?.question === "string" ? a.question.trim().slice(0, 200) : "",
      answer: typeof a?.answer === "string" ? a.answer.trim().slice(0, LIMITS.answer) : "",
    }))
    .filter((a) => a.question && a.answer);
  const projects = await getProjects();
  const matches = await getMatches(input, answers, projects);
  if (!matches) return UNAVAILABLE;
  const byId = new Map([...projects, CLAUDE_PLUGIN].map((p) => [p.id, p]));
  return { ok: true, matches: matches.map((m) => ({ ...byId.get(m.id)!, fit: m.fit, reason: m.reason })) };
}
