"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { cleanInput, getFollowUps, getMatches, getProjects, saveRequest, visitorHistory, type Match } from "@/lib/small-business";
import { ANSWER_MAX, CLAUDE_PLUGIN, FREE_SEARCHES, type BusinessInput, type FollowUp, type FollowUpAnswer, type Project } from "@/lib/small-business-options";

// The finder on /small-businesses. Public: anyone can use it. Each completed search is saved for
// the organizers (lib/small-business.ts, saveRequest). After FREE_SEARCHES searches a signed-out
// visitor must give an email to search again; signed-in people never do.
// Each step reads the catalog itself (summaries are cached in lib/small-business.ts).

type Fail = { ok: false; error: string; needEmail?: true };

const UNAVAILABLE: Fail = { ok: false, error: "Matching isn't available right now. Browse every project below instead." };
const NEED_EMAIL: Fail = { ok: false, needEmail: true, error: "Add your email to keep searching." };

const VISITOR_COOKIE = "sb_visitor";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The visitor's id from an httpOnly cookie, set on their first search; it groups their searches.
async function visitorId() {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;
  const id = randomUUID();
  jar.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}

// Who is searching, and the email to record: the one typed now, else one given on an earlier
// search. needEmail when a signed-out visitor has used their free searches and never gave one.
async function searcher(input: BusinessInput) {
  const [visitor, { data: claims }] = await Promise.all([visitorId(), (await createClient()).auth.getClaims()]);
  const profileId = claims?.claims.sub ?? null;
  // If the read fails, let the search through rather than block it.
  const history = await visitorHistory(visitor).catch((error) => {
    console.error("Small business: reading the visitor's searches failed", error);
    return { searches: 0, email: null };
  });
  const email = input.email || history.email || "";
  return { visitor, profileId, email, needEmail: !profileId && !email && history.searches >= FREE_SEARCHES };
}

export async function askFollowUps(raw: Partial<Record<keyof BusinessInput, unknown>>): Promise<{ ok: true; questions: FollowUp[] } | Fail> {
  const { input, problem } = cleanInput(raw);
  if (!input) return { ok: false, error: problem };
  if ((await searcher(input)).needEmail) return NEED_EMAIL;
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
  const { input, problem } = cleanInput(raw);
  if (!input) return { ok: false, error: problem };
  const who = await searcher(input);
  if (who.needEmail) return NEED_EMAIL;
  const answers: FollowUpAnswer[] = (Array.isArray(rawAnswers) ? rawAnswers : [])
    .slice(0, 3)
    .map((a) => ({
      question: typeof a?.question === "string" ? a.question.trim().slice(0, 200) : "",
      answer: typeof a?.answer === "string" ? a.answer.trim().slice(0, ANSWER_MAX) : "",
    }))
    .filter((a) => a.question && a.answer);
  const projects = await getProjects();
  const matches = await getMatches(input, answers, projects);
  if (!matches) return UNAVAILABLE;
  const byId = new Map([...projects, CLAUDE_PLUGIN].map((p) => [p.id, p]));
  const matched = matches.map((m) => ({ ...byId.get(m.id)!, fit: m.fit, reason: m.reason }));
  await saveRequest({
    visitorId: who.visitor,
    profileId: who.profileId,
    input: { ...input, email: who.email },
    answers,
    matches: matched.map((m) => ({ id: m.id, title: m.title, fit: m.fit, reason: m.reason })),
  });
  return { ok: true, matches: matched };
}
