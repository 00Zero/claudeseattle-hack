// Options and types for /small-businesses, shared by the server (lib/small-business.ts) and the
// finder in the browser.

export const INDUSTRIES = [
  "Food & beverage",
  "Retail & e-commerce",
  "Professional services",
  "Health & wellness",
  "Home & trade services",
  "Hospitality & events",
  "Creative & media",
  "Real estate",
  "Education & training",
  "Nonprofit",
  "Manufacturing & logistics",
] as const;

export const AREAS = [
  "Sales",
  "Marketing",
  "Customer service",
  "Operations",
  "Scheduling",
  "Finance & bookkeeping",
  "Hiring & HR",
  "Documents & admin",
  "Insights & strategy",
] as const;

// Each area's page, /small-businesses/<slug>: "Finance & bookkeeping" -> "finance-bookkeeping".
export const areaSlug = (area: string) => area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const areaFromSlug = (slug: string) => AREAS.find((area) => areaSlug(area) === slug) ?? null;

export const SETUPS = ["No code", "Some technical help", "Needs a developer"] as const;

export const TEAM_SIZES = ["Just me", "2–5", "6–20", "21–50", "51 or more"] as const;

export type Project = {
  id: string;
  title: string;
  by: string;
  summary: string;
  forWhom: string | null;
  industries: string[];
  areas: string[];
  setup: (typeof SETUPS)[number] | null;
  repoUrl: string | null;
  // The entry page on this site; null for the plugin.
  entryPath: string | null;
  // Anthropic's plugin page; null for entries.
  externalUrl: string | null;
  place: number | null;
};

export const CLAUDE_PLUGIN_ID = "claude-for-small-business";

// From https://www.anthropic.com/news/claude-for-small-business (May 2026).
export const CLAUDE_PLUGIN: Project = {
  id: CLAUDE_PLUGIN_ID,
  title: "Claude for Small Business",
  by: "Anthropic",
  summary:
    "Ready-made connectors and workflows for Claude Cowork that put Claude inside QuickBooks, PayPal, HubSpot, Canva, Docusign, Google Workspace, and Microsoft 365. Claude drafts the work, such as payroll planning, the monthly close, invoice chasing, lead triage, contracts, and campaigns, and you approve it before anything is sent, posted, or paid.",
  forWhom: "Any small business already using those tools that wants help across finance, operations, sales, marketing, HR, and customer service without building anything.",
  industries: [],
  areas: ["Finance & bookkeeping", "Operations", "Sales", "Marketing", "Hiring & HR", "Customer service"],
  setup: "No code",
  repoUrl: null,
  entryPath: null,
  externalUrl: "https://claude.com/solutions/small-business",
  place: null,
};

export type BusinessInput = {
  name: string;
  email: string;
  website: string;
  industry: string;
  size: string;
  tools: string;
  about: string;
  challenges: string;
  opportunities: string;
};

// The finder's fields. To make a field required or optional (or hide it), change its mode here:
// the form and the server both follow it. Steps 1 and 2 only; follow-up answers are always optional.
export type FieldMode = "required" | "optional" | "hidden";
export const FIELDS: Record<keyof BusinessInput, { step: 1 | 2; mode: FieldMode; max: number }> = {
  name: { step: 1, mode: "optional", max: 120 },
  email: { step: 1, mode: "optional", max: 200 },
  website: { step: 1, mode: "optional", max: 200 },
  industry: { step: 1, mode: "optional", max: 80 },
  size: { step: 1, mode: "optional", max: 40 },
  tools: { step: 1, mode: "optional", max: 400 },
  about: { step: 1, mode: "optional", max: 2000 },
  challenges: { step: 2, mode: "optional", max: 2000 },
  opportunities: { step: 2, mode: "optional", max: 2000 },
};
// Whatever their modes, at least one of these must be filled in: something to match on.
export const NEED_ONE_OF: (keyof BusinessInput)[] = ["challenges", "opportunities"];

// Searches a visitor can run before the finder asks for their email (signed-in people never are).
export const FREE_SEARCHES = 1;

export const ANSWER_MAX = 300;

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// What's missing or invalid in `input` for the given step(s), as one message; null when it's fine.
export function inputProblem(input: BusinessInput, steps: (1 | 2)[]): string | null {
  const keys = (Object.keys(FIELDS) as (keyof BusinessInput)[]).filter((k) => steps.includes(FIELDS[k].step));
  const missing = keys.filter((k) => FIELDS[k].mode === "required" && !input[k].trim());
  if (missing.length) return `Please fill in: ${missing.map((k) => LABELS[k].toLowerCase()).join(", ")}.`;
  if (keys.includes("email") && input.email.trim() && !EMAIL.test(input.email.trim())) return "That email address doesn't look right.";
  if (steps.includes(2) && NEED_ONE_OF.every((k) => !input[k].trim())) return `Fill in at least one of: ${NEED_ONE_OF.map((k) => LABELS[k].toLowerCase()).join(", ")}.`;
  return null;
}

export const LABELS: Record<keyof BusinessInput, string> = {
  name: "Business name",
  email: "Email",
  website: "Website",
  industry: "Industry",
  size: "How many people work there?",
  tools: "Tools you use today",
  about: "Describe your business",
  challenges: "What are your biggest challenges?",
  opportunities: "Where could AI help?",
};

export type FollowUp = { question: string; options: string[] };
export type FollowUpAnswer = { question: string; answer: string };
