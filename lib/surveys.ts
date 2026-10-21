import { createHash } from "node:crypto";

// Maps the two survey response sheets to survey_responses rows (0006_shared_surveys.sql).
// Like the Luma import, columns are matched by a lowercase phrase from the question, so
// small wording edits don't break the sync. Only listed questions are kept: a new question
// is reported as unmapped and dropped until it's added here. See docs/REQUIREMENTS.md,
// "Luma data: what goes where", for who may see each tier.

export const SURVEYS = ["attendee", "small_business"] as const;
export type Survey = (typeof SURVEYS)[number];

type Group = "answer" | "contact";
type Question = { key: string; phrase: string; group: Group };

// Every respondent identifies themselves with these; stored as columns, never in answers.
const META = { submitted_at: "timestamp", email: "email address", linkedin_url: "linkedin profile url" };

const QUESTIONS: Record<Survey, Question[]> = {
  attendee: [
    { key: "team_role", phrase: "which role would you fill", group: "answer" },
    { key: "years_experience", phrase: "years of full-time work experience", group: "answer" },
    { key: "git_done_last_year", phrase: "have you done in the last 12 months", group: "answer" },
    // Asked twice (professional and student branches); both land here.
    { key: "skills", phrase: "what skills would you bring", group: "answer" },
    { key: "ai_smb_seen", phrase: "implemented, or seen, an ai solution", group: "answer" },
    { key: "ai_smb_what", phrase: "describe what was implemented", group: "answer" },
    { key: "ai_smb_why_it_worked", phrase: "what made it work for a small business", group: "answer" },
    { key: "ai_smb_failures", phrase: "what have you seen fail", group: "answer" },
    { key: "program_type", phrase: "what type of program", group: "answer" },
    { key: "field_of_study", phrase: "field of study", group: "answer" },
    { key: "graduation_year", phrase: "graduation year", group: "answer" },
    { key: "ai_uses", phrase: "how do you currently use ai", group: "answer" },
    { key: "ai_frequency", phrase: "how often do you use ai tools", group: "answer" },
    { key: "program_ai_teaching", phrase: "program teaching about ai", group: "answer" },
    // Job search: matching input only. Never mention it in anything shown to people.
    { key: "has_job", phrase: "do you currently have a job", group: "answer" },
    { key: "job_search_difficulty", phrase: "how hard was it to get this job", group: "answer" },
    { key: "job_search_duration", phrase: "how long did your search take", group: "answer" },
    { key: "job_search_what_worked", phrase: "what made you successful", group: "answer" },
    { key: "job_search_length", phrase: "how long have you been looking", group: "answer" },
    { key: "job_search_challenges", phrase: "biggest challenges", group: "answer" },
    { key: "ai_experience_rating", phrase: "rate your overall experience with ai tools", group: "answer" },
    { key: "ai_tools", phrase: "which ai tools do you use regularly", group: "answer" },
  ],
  small_business: [
    { key: "business_role", phrase: "your role in the business", group: "answer" },
    { key: "industry", phrase: "what industry", group: "answer" },
    { key: "team_size", phrase: "how many people work in your business", group: "answer" },
    { key: "location", phrase: "where is your business based", group: "answer" },
    { key: "business_age", phrase: "how long has your business been operating", group: "answer" },
    { key: "ai_comfort", phrase: "how comfortable are you personally with ai", group: "answer" },
    { key: "ai_use_today", phrase: "business's use of ai today", group: "answer" },
    { key: "ai_tried_areas", phrase: "where have you tried using ai", group: "answer" },
    { key: "ai_tools", phrase: "which ai tools does your business use", group: "answer" },
    { key: "what_worked", phrase: "what has worked", group: "answer" },
    { key: "what_did_not_work", phrase: "what has not worked", group: "answer" },
    { key: "ai_spend_monthly", phrase: "spend on ai tools per month", group: "answer" },
    { key: "ai_users", phrase: "who in your business uses ai", group: "answer" },
    { key: "barriers", phrase: "main barriers", group: "answer" },
    { key: "biggest_barrier", phrase: "tell us more about your biggest barrier", group: "answer" },
    { key: "help_sources", phrase: "where do you go for help", group: "answer" },
    { key: "time_sinks", phrase: "cost your business the most time", group: "answer" },
    { key: "build_wish", phrase: "if a team could build one thing", group: "answer" },
    { key: "adoption_needs", phrase: "what would it take for you to adopt", group: "answer" },
    { key: "preferred_format", phrase: "which format would be most useful", group: "answer" },
    { key: "one_time_budget", phrase: "what one-time cost would you pay", group: "answer" },
    { key: "follow_up", phrase: "can we follow up with you", group: "contact" },
    { key: "business_name", phrase: "name of your small business", group: "contact" },
    { key: "business_website", phrase: "business website", group: "contact" },
  ],
};

// Never stored. The Apps Script drops these before sending; this is the second line.
const NEVER = ["revenue", "your name"];
// Kept by neither tier and not worth flagging.
const IGNORED = ["how did you hear about this survey"];

export type SurveyRow = {
  response_key: string;
  submitted_at: string | null;
  email: string | null;
  linkedin_url: string | null;
  contact: Record<string, string>;
  answers: Record<string, string>;
};

export type ParsedSurvey = { rows: SurveyRow[]; unmapped: string[]; dropped: string[] };

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function timestamp(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseSurvey(survey: Survey, headers: unknown[], values: unknown[][]): ParsedSurvey {
  const lower = headers.map((h) => text(h).toLowerCase());
  const find = (phrase: string) => lower.findIndex((h) => h.includes(phrase));

  const meta = Object.fromEntries(Object.entries(META).map(([k, phrase]) => [k, find(phrase)])) as Record<
    keyof typeof META,
    number
  >;
  // Column index -> question, so a question asked in two branches maps both columns.
  const byColumn = new Map<number, Question>();
  for (const question of QUESTIONS[survey]) {
    lower.forEach((h, i) => {
      if (h.includes(question.phrase) && !byColumn.has(i)) byColumn.set(i, question);
    });
  }

  const unmapped: string[] = [];
  const dropped: string[] = [];
  lower.forEach((h, i) => {
    if (!h || byColumn.has(i) || Object.values(meta).includes(i)) return;
    if (NEVER.some((p) => h.includes(p))) dropped.push(text(headers[i]));
    else if (!IGNORED.some((p) => h.includes(p))) unmapped.push(text(headers[i]));
  });

  const byKey = new Map<string, SurveyRow>();
  for (const record of values) {
    const cell = (i: number) => (i >= 0 ? text(record[i]) : "");
    const submittedAt = timestamp(cell(meta.submitted_at));
    const email = cell(meta.email).toLowerCase() || null;
    if (!submittedAt && !email) continue; // blank row

    const answers: Record<string, string> = {};
    const contact: Record<string, string> = {};
    for (const [i, question] of byColumn) {
      const value = cell(i);
      if (!value) continue;
      const target = question.group === "answer" ? answers : contact;
      target[question.key] = target[question.key] ? `${target[question.key]}, ${value}` : value;
    }

    const responseKey = createHash("sha256").update(`${survey}|${submittedAt ?? ""}|${email ?? ""}`).digest("hex");
    // A later row with the same key (same second, same email) wins.
    byKey.set(responseKey, {
      response_key: responseKey,
      submitted_at: submittedAt,
      email,
      linkedin_url: cell(meta.linkedin_url) || null,
      contact,
      answers,
    });
  }

  return { rows: [...byKey.values()], unmapped, dropped };
}
