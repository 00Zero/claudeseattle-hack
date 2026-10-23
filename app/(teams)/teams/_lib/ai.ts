import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import type { MatchingProfile } from "@/lib/matching";
import { leakKind } from "./privacy";
import type { Balance } from "./teams";

// AI-assisted matching: Claude Haiku through the Vercel AI Gateway (server-side only;
// CLAUDE.md, "Models"). Two uses: rank a shortlist of people for a team, and write a short
// "why you'd fit" note for someone looking at a team.
//
// Privacy (CLAUDE.md and app/(teams)/CLAUDE.md): matching signals include Luma answers,
// LinkedIn enrichment, and survey answers that people never see on profiles. Those go to the
// model as scoring input only, labeled PRIVATE. Job-search answers and the whole business
// survey are never sent. Every reason the model writes passes leakCheck() before anyone sees
// it; a reason that uses a word found only in someone's private signals is dropped.

const MODEL = "anthropic/claude-haiku-5.5";
const CACHE_SECONDS = 6 * 60 * 60;

let client: Anthropic | null = null;
function gateway() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;
  client ??= new Anthropic({ apiKey, baseURL: "https://ai-gateway.vercel.sh", timeout: 20_000, maxRetries: 1 });
  return client;
}

// ---------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------

export type TeamContext = {
  id: string;
  name: string;
  concept: string | null;
  looking_for: string | null;
  balance: Balance;
  members: { role: string; technical: boolean; title: string | null; bio: string | null }[];
};

const clip = (value: unknown, max: number) => {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

const JOB_SEARCH = /^(has_job|job_search_)/;

const ROLE_WORDS: Record<string, string> = {
  owner: "business owner or founder",
  professional: "experienced professional",
  student: "student or recent grad",
};

function roleOf(p: Pick<MatchingProfile, "platform_role" | "role_bucket">) {
  if (p.platform_role === "mentor") return "mentor";
  return p.role_bucket ? ROLE_WORDS[p.role_bucket] ?? p.role_bucket : "unknown";
}

// What the person shows on their profile, which the viewer can already see.
function publicFields(p: MatchingProfile) {
  return {
    role: roleOf(p),
    technical: p.is_technical === true,
    title: clip([p.job_title, p.company].filter(Boolean).join(" at "), 120),
    bio: clip(p.bio, 300),
    interests: clip(p.interests, 300),
    looking_for: clip(p.looking_for, 300),
    claude_code: clip(p.claude_code_level, 80),
  };
}

// Matching-only signals: never shown, never quoted. No job-search answers, no business survey.
function privateFields(p: MatchingProfile) {
  const survey = Object.fromEntries(
    Object.entries(p.attendee_survey ?? {})
      .filter(([key]) => !JOB_SEARCH.test(key))
      .map(([key, value]) => [key, clip(value, 200)]),
  );
  return {
    professional_role: clip(p.professional_role, 80),
    company_size: clip(p.employee_count, 40),
    github_experience: clip(p.github_experience, 120),
    why_join: clip(p.why_join, 400),
    features_interest: clip(p.features_interest, 300),
    linkedin_headline: clip(p.linkedin_headline, 200),
    linkedin_title: clip([p.linkedin_title, p.linkedin_company].filter(Boolean).join(" at "), 160),
    linkedin_summary: clip(p.linkedin_summary, 500),
    linkedin_skills: (p.linkedin_skills ?? []).slice(0, 15),
    linkedin_experience: clip(p.linkedin_experiences, 500),
    survey,
  };
}

const textOf = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

function teamPayload(team: TeamContext) {
  const missing = (["owner", "professional", "student", "technical"] as const)
    .filter((key) => !team.balance[key])
    .map((key) => (key === "technical" ? "someone technical" : ROLE_WORDS[key]));
  return {
    name: team.name,
    concept: clip(team.concept, 800),
    looking_for: clip(team.looking_for, 300),
    missing_roles: missing,
    members: team.members.map((m) => ({ role: m.role, technical: m.technical, title: clip(m.title, 120), bio: clip(m.bio, 200) })),
  };
}

const EVENT = `The event is a one-day hackathon in Seattle: teams build AI tools, workflows, and playbooks that small businesses can adopt. Teams should be 3–5 people. A balanced team has a business owner or founder, an experienced professional, a student or recent grad, and at least one technical member. Mentors help but don't count toward balance.`;

const PRIVACY = `Each person has PUBLIC fields (shown on their profile) and PRIVATE fields (registration answers, survey answers, LinkedIn data). Use both to judge fit. But write only from PUBLIC fields, their role, whether they're technical, and the team's own text. Never mention, quote, paraphrase, or hint at anything that appears only in PRIVATE fields. Don't name any company, school, place, product, or tool unless it appears in that person's PUBLIC fields or the team's text. Never use people's names.`;

async function callJson<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<T | null> {
  const api = gateway();
  if (!api) return null;
  const response = await api.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason !== "end_turn") {
    console.warn("Teams AI: unexpected stop", response.stop_reason);
    return null;
  }
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") return null;
  console.info("Teams AI usage", { input: response.usage.input_tokens, output: response.usage.output_tokens });
  return JSON.parse(text.text) as T;
}

// ---------------------------------------------------------------------------------------
// Rank a shortlist for a team
// ---------------------------------------------------------------------------------------

export type AiPick = { profileId: string; score: number; reason: string | null };

const RANK_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, score: { type: "integer" }, reason: { type: "string" } },
        required: ["id", "score", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
};

const RANK_SYSTEM = `You help hackathon team leaders find teammates among people who don't have a team yet.

${EVENT}

Score every candidate from 0 to 100 for how much they would strengthen this team. Weigh, in order: filling a role the team is missing, skills and experience that fit the team's concept, then stated interests. Spread the scores out; don't give everyone similar numbers.

${PRIVACY}

For each candidate write one reason to the team leader: a single sentence of at most 20 words.`;

// Ranks up to ~15 candidates. Returns picks sorted by score, or null if the model is
// unavailable. Cached by a fingerprint of everything sent, so it only reruns when the team
// or the candidates change.
export async function rankForTeam(team: TeamContext, candidates: MatchingProfile[]): Promise<AiPick[] | null> {
  if (!candidates.length) return [];
  const aliases = candidates.map((p, i) => ({ alias: `c${i + 1}`, profile: p }));
  const payload = {
    team: teamPayload(team),
    candidates: aliases.map(({ alias, profile }) => ({ id: alias, PUBLIC: publicFields(profile), PRIVATE: privateFields(profile) })),
  };
  const key = hashOf({ v: 5, payload });

  // Failures throw inside the cached function (not cached) and become null out here.
  const cached = unstable_cache(
    async () => {
      const result = await callJson<{ picks: { id: string; score: number; reason: string }[] }>(
        RANK_SYSTEM,
        JSON.stringify(payload),
        RANK_SCHEMA,
        4000,
      );
      if (!result) throw new Error("no ranking from the model");
      const teamText = [team.name, team.concept, team.looking_for].filter(Boolean).join(" ");
      const leakCounts = { name: 0, phrase: 0 };
      const picks = result.picks
        .map((pick) => {
          const match = aliases.find((a) => a.alias === pick.id);
          if (!match) return null;
          const allowed = [teamText, ...Object.values(publicFields(match.profile)).map(textOf)].join(" ");
          const privateText = Object.values(privateFields(match.profile)).map(textOf).join(" ");
          const kind = pick.reason ? leakKind(pick.reason, privateText, allowed) : "phrase";
          if (kind) leakCounts[kind] += 1;
          const safe = kind ? null : clip(pick.reason, 200);
          return { profileId: match.profile.profile_id, score: Math.max(0, Math.min(100, Math.round(pick.score))), reason: safe };
        })
        .filter((pick): pick is AiPick => pick !== null)
        .sort((a, b) => b.score - a.score);
      const dropped = picks.filter((p) => p.reason === null).length;
      if (dropped) console.info(`Teams AI: leak check dropped ${dropped} of ${picks.length} reasons`, leakCounts);
      return picks;
    },
    ["teams-ai-rank", key],
    { revalidate: CACHE_SECONDS },
  );
  try {
    return await cached();
  } catch (error) {
    console.error("Teams AI: ranking failed", error);
    return null;
  }
}

// ---------------------------------------------------------------------------------------
// "Why you'd fit" for someone looking at a team
// ---------------------------------------------------------------------------------------

export type AiBlurb = { fit: "strong" | "some" | "weak"; text: string };

const BLURB_SCHEMA = {
  type: "object",
  properties: { fit: { type: "string", enum: ["strong", "some", "weak"] }, text: { type: "string" } },
  required: ["fit", "text"],
  additionalProperties: false,
};

const BLURB_SYSTEM = `You help people at a hackathon decide which team to join.

${EVENT}

Given a team and the person viewing it, write two short sentences, at most 45 words in total, addressed to the person ("you"): how they would fit this team, which missing role or skill they could cover, and what to talk to the team about. Be honest: if the fit is weak, say what the team needs instead. Rate the fit as strong, some, or weak.

${PRIVACY.replace("Each person has", "The viewer has")}`;

export async function blurbForViewer(team: TeamContext, viewer: MatchingProfile): Promise<AiBlurb | null> {
  const payload = { team: teamPayload(team), viewer: { PUBLIC: publicFields(viewer), PRIVATE: privateFields(viewer) } };
  const key = hashOf({ v: 5, payload });

  const cached = unstable_cache(
    async () => {
      const result = await callJson<AiBlurb>(BLURB_SYSTEM, JSON.stringify(payload), BLURB_SCHEMA, 2000);
      if (!result?.text) throw new Error("no blurb from the model");
      const allowed = [team.name, team.concept, team.looking_for, ...Object.values(payload.viewer.PUBLIC).map(textOf)].join(" ");
      const privateText = Object.values(privateFields(viewer)).map(textOf).join(" ");
      // A leaky blurb is a valid (cached) "nothing to show", not an error to retry.
      const kind = leakKind(result.text, privateText, allowed);
      if (kind) {
        console.info("Teams AI: leak check dropped a blurb", kind);
        return null;
      }
      return { fit: result.fit, text: clip(result.text, 600) };
    },
    ["teams-ai-blurb", key],
    { revalidate: CACHE_SECONDS },
  );
  try {
    return await cached();
  } catch (error) {
    console.error("Teams AI: blurb failed", error);
    return null;
  }
}
