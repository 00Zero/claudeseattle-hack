import "server-only";
import type { Group, Role } from "./survey";

// The feedback emails: default text per group (an admin's edits in followup_emails win), how the
// placeholders fill in, and sending through Resend's batch API.

// email.claudeseattle.org is the domain verified in Resend (lib/email.ts). It can't receive mail, so
// replies go to adam@claudeseattle.org (forwarded by Cloudflare Email Routing), or FOLLOWUP_REPLY_TO if set.
export const FOLLOWUP_FROM = "Adam from Claude Seattle <adam@email.claudeseattle.org>";
export const followupReplyTo = () => process.env.FOLLOWUP_REPLY_TO || "adam@claudeseattle.org";

export const PLACEHOLDERS: { key: string; meaning: string }[] = [
  { key: "{first_name}", meaning: "first name from Luma (\"there\" if missing)" },
  { key: "{sign_in_email}", meaning: "\"this email address\", or the account's own email if they sign in with a different one" },
  { key: "{survey_link}", meaning: "their personal survey link (a button in the email)" },
  { key: "{upload_link}", meaning: "sign in, then upload photos and videos on Resources" },
  { key: "{results_link}", meaning: "the results page with every project" },
  { key: "{role}", meaning: "mentoring, judging or volunteering (mentors, judges, volunteers group)" },
];

const WINNERS =
  "Congratulations to BidWriter (1st place and the audience vote), Neri Cash (2nd) and Corporate Meets Creatives (3rd).";
const SIGNOFF = "Thank you,\nAdam\nClaude Community Seattle";

export const DEFAULT_EMAILS: Record<Group, { subject: string; body: string }> = {
  attended: {
    subject: "How was Sunday? 3 minutes of feedback, and your photos",
    body: `Hi {first_name},

Thank you for building with us at the Claude Impact Lab Hackathon on Sunday. 22 teams shipped tools for small businesses, and every project is open source. ${WINNERS} See every project: {results_link}

Would you take 3 minutes to tell us how it went? A few quick questions come first; the rest is optional.

{survey_link}

Did you take photos or videos? Please upload them so we can share the day. Sign in with {sign_in_email}:

{upload_link}

${SIGNOFF}`,
  },
  unsure: {
    subject: "How was Sunday? 3 minutes of feedback",
    body: `Hi {first_name},

Thank you for being part of the Claude Impact Lab Hackathon. 22 teams shipped tools for small businesses on Sunday, and every project is open source. ${WINNERS} See every project: {results_link}

Whether or not you made it on Sunday, would you take 3 minutes to tell us how it went? A few quick questions come first; the rest is optional.

{survey_link}

If you were there and took photos or videos, please upload them. Sign in with {sign_in_email}:

{upload_link}

${SIGNOFF}`,
  },
  crew: {
    subject: "Thank you for helping on Sunday, and a few quick questions",
    body: `Hi {first_name},

Thank you for {role} at the Claude Impact Lab Hackathon on Sunday. 22 teams shipped tools for small businesses, and the day ran because of you. ${WINNERS} See every project: {results_link}

Would you take 3 minutes to tell us what worked and what to change? A few quick questions come first; the rest is optional.

{survey_link}

If you took photos or videos, please upload them. Sign in with {sign_in_email}:

{upload_link}

${SIGNOFF}`,
  },
  no_show: {
    subject: "We missed you on Sunday: 4 quick questions",
    body: `Hi {first_name},

We're sorry we didn't see you at the Claude Impact Lab Hackathon on Sunday. 22 teams shipped open-source tools for small businesses. ${WINNERS} See every project: {results_link}

We'd like to understand what got in the way, so future events work for more people. It takes under a minute:

{survey_link}

Upcoming Claude events in Seattle are at luma.com/adamburgh.

${SIGNOFF}`,
  },
  late_cancel: {
    subject: "Thanks for letting us know, and 3 quick questions",
    body: `Hi {first_name},

Thank you for letting us know you couldn't make it to Sunday's Claude Impact Lab Hackathon; it helped us plan for the people who came. 22 teams shipped open-source tools for small businesses. ${WINNERS} See every project: {results_link}

Would you tell us what made it hard to come? It takes under a minute:

{survey_link}

Upcoming Claude events in Seattle are at luma.com/adamburgh.

${SIGNOFF}`,
  },
  standby: {
    subject: "Thanks for joining the standby list",
    body: `Hi {first_name},

Thank you for joining the standby list for Sunday's Claude Impact Lab Hackathon, and for being flexible. 22 teams shipped open-source tools for small businesses. ${WINNERS} See every project: {results_link}

We're always looking for creative ways to admit as many people as possible, and standby was an experiment. Every standby guest who checked in on Sunday got a spot on a team. We'd love your feedback on how it worked for you. It takes under a minute:

{survey_link}

Upcoming Claude events in Seattle are at luma.com/adamburgh.

${SIGNOFF}`,
  },
};

const ROLE_WORDS: Partial<Record<Role, string>> = { mentor: "mentoring", judge: "judging", volunteer: "volunteering", ambassador: "volunteering" };

export type Rendered = { subject: string; text: string; html: string };

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Fills the placeholders. A placeholder alone on its line becomes a button in the HTML version.
// signInEmail: the address their account signs in with, when it isn't the one this email goes to.
export function renderEmail(
  template: { subject: string; body: string },
  values: { firstName: string | null; role: Role; signInEmail?: string | null; surveyUrl: string; uploadUrl: string; resultsUrl: string },
): Rendered {
  const firstName = values.firstName || "there";
  const signIn = values.signInEmail ? `your account's email, ${values.signInEmail}` : "this email address";
  const links: Record<string, { url: string; label: string }> = {
    "{survey_link}": { url: values.surveyUrl, label: "Take the survey" },
    "{upload_link}": { url: values.uploadUrl, label: "Upload photos and videos" },
    "{results_link}": { url: values.resultsUrl, label: values.resultsUrl.replace(/^https?:\/\//, "") },
  };
  // Saved edits come from a browser form, which sends Windows line breaks (\r\n); paragraphs and buttons
  // depend on blank lines, so treat every line break the same.
  const body = template.body.replace(/\r\n?/g, "\n");
  const words = (s: string) =>
    s.replaceAll("{first_name}", firstName).replaceAll("{role}", ROLE_WORDS[values.role] ?? "helping").replaceAll("{sign_in_email}", signIn);

  const text = words(body).replace(/\{(survey|upload|results)_link\}/g, (key) => links[key].url);
  const footer = "You're getting this because you registered for the Claude Impact Lab Hackathon on Luma.";

  const html = words(body)
    .split(/\n{2,}/)
    .map((para) => {
      const trimmed = para.trim();
      const button = links[trimmed];
      if (button && trimmed !== "{results_link}") {
        return `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#c96442;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a></p>`;
      }
      const body = escapeHtml(trimmed)
        .replace(/\{(survey|upload|results)_link\}/g, (key) => `<a href="${escapeHtml(links[key].url)}" style="color:#c96442">${escapeHtml(links[key].label)}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px">${body}</p>`;
    })
    .join("");

  return {
    subject: words(template.subject),
    text: `${text}\n\n--\n${footer}`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#141413;max-width:560px">${html}<p style="margin:32px 0 0;font-size:13px;color:#6b6a65">${escapeHtml(footer)}</p></div>`,
  };
}

// Sends up to 100 emails in one Resend call. Returns Resend's ids in the same order.
export async function sendBatch(messages: (Rendered & { to: string })[], idempotencyKey: string): Promise<string[]> {
  const response = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(
      messages.map((m) => ({ from: FOLLOWUP_FROM, to: [m.to], reply_to: followupReplyTo(), subject: m.subject, text: m.text, html: m.html })),
    ),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = (await response.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((d) => d.id);
}
