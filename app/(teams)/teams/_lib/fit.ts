// "Best fit for your team" on the people page. Pure scoring, so it can be tested on its own.
//
// Inputs are matching signals (lib/matching.ts): profile fields people chose to show, plus
// Luma answers and LinkedIn enrichment they didn't. Per CLAUDE.md the private ones never
// reach the browser: they only move the score, and the reasons we show name either a
// balance role or words from the person's own public profile fields.

import type { Balance, RoleBucket } from "./teams";

export type FitTeam = { concept: string | null; looking_for: string | null; balance: Balance };

export type FitPerson = {
  role_bucket: string | null;
  is_technical: boolean | null;
  platform_role: string;
  // Public: shown on the person's card already.
  job_title: string | null;
  bio: string | null;
  interests: string | null;
  looking_for: string | null;
  // Private: matching only.
  professional_role: string | null;
  why_join: string | null;
  features_interest: string | null;
  linkedin_headline: string | null;
  linkedin_summary: string | null;
  linkedin_title: string | null;
  linkedin_skills: string[] | null;
};

export type Fit = { score: number; reasons: string[] };

const ROLE_NAME: Record<RoleBucket, string> = {
  owner: "a business owner or founder",
  professional: "an experienced professional",
  student: "a student or recent grad",
};

// Words too common at this event to say anything about fit.
const STOPWORDS = new Set(
  (
    "about after also been being both build building built business businesses claude could does doing each " +
    "from have help helping into just like looking make more most much need needs other over people really " +
    "same some someone something such team teams than that their them then there these they thing things " +
    "this those through tool tools using very want wants what when where which while will with work working " +
    "would your small owner owners person ideas idea interested love learn learning hackathon event good great"
  ).split(" "),
);

// Lowercase words of 4+ letters, minus stopwords, with a trailing plural "s" dropped.
export function terms(...texts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    for (const word of (text ?? "").toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
      const stem = word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
      if (!STOPWORDS.has(stem) && !STOPWORDS.has(word)) out.add(stem);
    }
  }
  return out;
}

export function fitFor(team: FitTeam, person: FitPerson): Fit {
  let score = 0;
  const reasons: string[] = [];
  const mentor = person.platform_role === "mentor";

  // Balance first: the spec's four roles, which mentors don't count toward.
  const bucket = person.role_bucket as RoleBucket | null;
  if (!mentor && bucket && bucket in ROLE_NAME && !team.balance[bucket]) {
    score += 3;
    reasons.push(`Your team needs ${ROLE_NAME[bucket]}`);
  }
  if (!mentor && person.is_technical && !team.balance.technical) {
    score += 3;
    reasons.push("Your team needs someone technical");
  }

  // Shared words between the team's concept and looking-for, and the person's signals.
  const teamTerms = terms(team.concept, team.looking_for);
  const publicTerms = terms(person.job_title, person.bio, person.interests, person.looking_for);
  const privateTerms = terms(
    person.professional_role,
    person.why_join,
    person.features_interest,
    person.linkedin_headline,
    person.linkedin_summary,
    person.linkedin_title,
    (person.linkedin_skills ?? []).join(" "),
  );
  const publicShared = [...teamTerms].filter((t) => publicTerms.has(t));
  const privateShared = [...teamTerms].filter((t) => privateTerms.has(t) && !publicTerms.has(t));

  score += Math.min(publicShared.length, 3) + Math.min(privateShared.length, 4) * 0.5;
  if (publicShared.length) reasons.push(`Also mentions ${publicShared.slice(0, 3).join(", ")}`);
  else if (privateShared.length >= 2) reasons.push("Background fits your concept");

  return { score, reasons };
}
