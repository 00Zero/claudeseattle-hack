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

export const LIMITS = { name: 120, industry: 80, size: 40, tools: 400, about: 2000, challenges: 2000, opportunities: 2000, answer: 300 };

export type BusinessInput = {
  name: string;
  industry: string;
  size: string;
  tools: string;
  about: string;
  challenges: string;
  opportunities: string;
};

export type FollowUp = { question: string; options: string[] };
export type FollowUpAnswer = { question: string; answer: string };
