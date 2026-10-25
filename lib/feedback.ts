import "server-only";
import { getCurrentAccess } from "@/lib/access";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

// The feedback button: bug reports, things not working and questions, posted straight to Slack
// through an incoming webhook. Nothing is stored. See *_shared_feedback.sql.

export const FEEDBACK_AUDIENCES = ["off", "approved", "signed_in"] as const;
export type FeedbackAudience = (typeof FEEDBACK_AUDIENCES)[number];

export const FEEDBACK_KINDS = { bug: "Bug", broken: "Not working", question: "Question", other: "Other" } as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;

export const FEEDBACK_MAX_LENGTH = 2000;

// NULL (never set) counts as approved attendees only.
export function feedbackAudience(value: string | null | undefined): FeedbackAudience {
  return FEEDBACK_AUDIENCES.includes(value as FeedbackAudience) ? (value as FeedbackAudience) : "approved";
}

// The signed-in person, if the current audience setting lets them send feedback.
export async function getFeedbackSender() {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const [{ data: settings }, access] = await Promise.all([
    supabase.from("event_settings").select("feedback_audience").eq("id", 1).maybeSingle(),
    getCurrentAccess(),
  ]);
  const audience = feedbackAudience(settings?.feedback_audience);
  if (audience === "off") return null;
  if (audience === "approved" && access !== "full") return null;
  return profile;
}

// Slack reads &, < and > as markup (<!channel> pings everyone), so user text is escaped.
function escapeSlack(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slackWebhookConfigured() {
  return Boolean(process.env.SLACK_FEEDBACK_WEBHOOK_URL);
}

// Posts one message, starting with the site label so a channel shared with other sites can tell
// them apart. Throws if the webhook is missing or Slack refuses it.
export async function postFeedbackToSlack(message: {
  kind: FeedbackKind;
  text: string;
  page: string;
  name: string;
  email: string | null;
}) {
  const url = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  if (!url) throw new Error("SLACK_FEEDBACK_WEBHOOK_URL is not set");
  const label = process.env.FEEDBACK_SITE_LABEL || "ClaudeSEA";
  const who = message.email ? `${message.name} (${message.email})` : message.name;
  const text =
    `*[${escapeSlack(label)}] ${FEEDBACK_KINDS[message.kind]}* · ${escapeSlack(message.page)} · ${escapeSlack(who)}\n` +
    escapeSlack(message.text)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Slack returned ${response.status}`);
}
