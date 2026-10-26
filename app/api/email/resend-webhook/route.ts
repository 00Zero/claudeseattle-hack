import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Resend's webhook (Resend -> Webhooks, endpoint https://hack.claudeseattle.org/api/email/resend-webhook,
// events email.delivered, email.opened, email.bounced, email.complained). Records them on the feedback
// email's invite (followup_invites.resend_id); events for other emails, like sign-in links, are ignored.
// Signed the Svix way: HMAC-SHA256 of "<id>.<timestamp>.<body>" with RESEND_WEBHOOK_SECRET ("whsec_...").

const COLUMN: Record<string, string> = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.bounced": "bounced_at",
  "email.complained": "complained_at",
};
const TOLERANCE_SECONDS = 5 * 60;

function verified(secret: string, id: string, timestamp: string, body: string, signatures: string) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const body = await request.text();
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signatures = request.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !verified(secret, id, timestamp, body, signatures)) return new Response("Bad signature", { status: 401 });

  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const column = COLUMN[event.type ?? ""];
  const emailId = event.data?.email_id;
  if (!column || !emailId) return new Response("Ignored", { status: 200 });

  // First time only: a later open doesn't move "opened" forward.
  const { error } = await createAdminClient()
    .from("followup_invites")
    .update({ [column]: event.created_at ?? new Date().toISOString() })
    .eq("resend_id", emailId)
    .is(column, null);
  if (error) {
    console.error("Resend webhook update failed", error.message);
    return new Response("Error", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
