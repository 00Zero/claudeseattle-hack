import { parseCsv } from "@/lib/csv";
import { isValidEmail } from "@/lib/email";

// Maps the Luma guests CSV to luma_guests rows. Custom-question columns are
// matched by a phrase from the question text, so small wording edits in Luma
// don't break the import. Only the columns below are kept; the rest of the
// export (QR code, payment, UTM and click IDs, referrals, consent answers) is
// dropped here. See docs/REQUIREMENTS.md, "Luma data: what goes where".

export const LUMA_STATUSES = ["approved", "pending_approval", "waitlist", "declined"] as const;
export type LumaStatus = (typeof LUMA_STATUSES)[number];

export type LumaGuestRow = {
  guest_id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  claude_email: string | null;
  approval_status: LumaStatus;
  ticket_name: string;
  checked_in_at: string | null;
  linkedin_url: string | null;
  github_username: string | null;
  professional_role: string | null;
  company: string | null;
  job_title: string | null;
  employee_count: string | null;
  claude_code_level: string | null;
  github_experience: string | null;
  why_join: string | null;
  features_interest: string | null;
  portfolio_url: string | null;
};

type Column = keyof LumaGuestRow;

// Exact header names for Luma's built-in columns; a lowercase phrase for custom questions.
const EXACT: Partial<Record<Column, string>> = {
  guest_id: "guest_id",
  name: "name",
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  approval_status: "approval_status",
  ticket_name: "ticket_name",
  checked_in_at: "checked_in_at",
};
const PHRASE: Partial<Record<Column, string>> = {
  claude_email: "email associated with your claude account",
  linkedin_url: "your linkedin profile",
  github_username: "github username",
  professional_role: "professional role",
  company: "where do you work or study",
  job_title: "job title",
  employee_count: "number of employees",
  claude_code_level: "experience level with claude code",
  github_experience: "github experience",
  why_join: "why do you want to join",
  features_interest: "claude features or capabilities",
  portfolio_url: "website for your small business",
};
const REQUIRED: Column[] = ["guest_id", "email", "approval_status"];

export type ParseResult = {
  rows: LumaGuestRow[];
  missingColumns: string[];
  skipped: { reason: string; count: number }[];
};

function clean(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// "https://github.com/someone/" -> "someone"
export function githubUsername(value: string | null) {
  if (!value) return null;
  return value.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/[/?#].*$/, "") || null;
}

// Free-text answer: keep it only if it is an email ("n/a" and the like become null).
function claudeEmail(value: string | null) {
  const email = value?.toLowerCase() ?? "";
  return isValidEmail(email) ? email : null;
}

function timestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseLumaCsv(text: string): ParseResult {
  const [header = [], ...data] = parseCsv(text);
  const headers = header.map((h) => h.trim());
  const lower = headers.map((h) => h.toLowerCase());

  const index: Partial<Record<Column, number>> = {};
  for (const [column, name] of Object.entries(EXACT) as [Column, string][]) {
    const i = headers.indexOf(name);
    if (i >= 0) index[column] = i;
  }
  for (const [column, phrase] of Object.entries(PHRASE) as [Column, string][]) {
    const i = lower.findIndex((h) => h.includes(phrase));
    if (i >= 0) index[column] = i;
  }

  const missingColumns = [...Object.keys(EXACT), ...Object.keys(PHRASE)].filter((c) => index[c as Column] === undefined);
  if (REQUIRED.some((c) => index[c] === undefined)) {
    return { rows: [], missingColumns, skipped: [] };
  }

  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const byGuest = new Map<string, LumaGuestRow>();
  const get = (record: string[], column: Column) => {
    const i = index[column];
    return i === undefined ? null : clean(record[i]);
  };

  for (const record of data) {
    const guestId = get(record, "guest_id");
    const email = get(record, "email")?.toLowerCase();
    const status = get(record, "approval_status") as LumaStatus | null;
    if (!guestId || !email) {
      skip("missing guest_id or email");
      continue;
    }
    if (!status || !LUMA_STATUSES.includes(status)) {
      skip(`unknown approval_status "${status ?? ""}"`);
      continue;
    }
    byGuest.set(guestId, {
      guest_id: guestId,
      name: get(record, "name"),
      first_name: get(record, "first_name"),
      last_name: get(record, "last_name"),
      email,
      claude_email: claudeEmail(get(record, "claude_email")),
      approval_status: status,
      ticket_name: get(record, "ticket_name") ?? "",
      checked_in_at: timestamp(get(record, "checked_in_at")),
      linkedin_url: get(record, "linkedin_url"),
      github_username: githubUsername(get(record, "github_username")),
      professional_role: get(record, "professional_role"),
      company: get(record, "company"),
      job_title: get(record, "job_title"),
      employee_count: get(record, "employee_count"),
      claude_code_level: get(record, "claude_code_level"),
      github_experience: get(record, "github_experience"),
      why_join: get(record, "why_join"),
      features_interest: get(record, "features_interest"),
      portfolio_url: get(record, "portfolio_url"),
    });
  }

  return {
    rows: [...byGuest.values()],
    missingColumns,
    skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
  };
}
