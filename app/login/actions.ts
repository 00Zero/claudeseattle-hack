"use server";

import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, maskEmail, normalizeEmail, sendEmail } from "@/lib/email";
import { getOrigin } from "@/lib/site-url";
import { registrationMode, registrationOpen } from "@/lib/registration";
import { SIGN_IN_NEXT_COOKIE, SIGN_IN_NEXT_MAX_AGE, safeNextPath } from "@/lib/sign-in-next";

// How long after a link is sent before we send another to the same account. Supabase keeps
// one live link per account, so a new link cancels the one still on its way; people who
// asked again while the first email was slow then clicked a dead link.
const RESEND_AFTER_SECONDS = 5 * 60;

export type LoginState =
  | { status: "idle" }
  | {
      status: "sent";
      address: string;
      // When the live link was sent, and when a new one may be requested (ISO times).
      sentAt: string;
      resendAt: string;
      // True when a link sent earlier is still on its way, so none was sent this time.
      alreadySent: boolean;
    }
  | {
      // No link sent. linked: the email is linked to an account that signs in with another
      // address. claude: it's the Claude-account email on a Luma registration. unregistered:
      // not on Luma. requested / declined: a sign-in request for it exists. closed: new accounts
      // are closed (Admin -> Settings) and this email has none.
      status: "not_sent";
      reason: "linked" | "claude" | "unregistered" | "requested" | "declined" | "closed";
      typed: string;
      // The address to use instead (masked), for linked and claude.
      useInstead: string | null;
    }
  | { status: "error"; message: string };

export type RequestState =
  | { status: "idle" }
  | { status: "requested"; email: string }
  | { status: "error"; message: string };

// When this account's live sign-in link was sent: a magic link (recovery_sent_at) or, for an
// account that hasn't signed in yet, the signup confirmation. Null once that link was used.
function liveLinkSentAt(user: User) {
  const sent = Math.max(
    user.recovery_sent_at ? Date.parse(user.recovery_sent_at) : 0,
    user.confirmation_sent_at ? Date.parse(user.confirmation_sent_at) : 0,
  );
  const signedIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  return sent > signedIn ? sent : null;
}

type Kind =
  | { kind: "account"; user: User } // signs in with this email
  | { kind: "registered" } // a Luma registration email with no account yet
  | { kind: "linked"; authEmail: string } // verified on an account that signs in with authEmail
  | { kind: "claude"; guestId: string; lumaEmail: string } // the Claude-account email on a registration
  | { kind: "unregistered" };

// What a typed email is. Links go only to "account" and "registered" emails, and only to the
// email as typed: a link sent to another inbox looked like a slow email, so people asked again.
// Throws if a lookup fails (for example a timeout), so a slow database never tells a registered
// person they aren't registered.
async function classify(email: string): Promise<Kind> {
  const admin = createAdminClient();
  const check = <T,>(result: { data: T; error: { message: string } | null }) => {
    if (result.error) throw new Error(`login lookup failed: ${result.error.message}`);
    return result.data;
  };

  const owner = check(
    await admin.from("profile_emails").select("profile_id").eq("email", email).eq("verified", true).maybeSingle(),
  );
  if (owner) {
    const { data, error } = await admin.auth.admin.getUserById(owner.profile_id);
    if (error) throw new Error(`login lookup failed: ${error.message}`);
    const user = data.user;
    const authEmail = user?.email?.toLowerCase();
    if (user && authEmail === email) return { kind: "account", user };
    if (authEmail) return { kind: "linked", authEmail };
  }

  const guest = check(await admin.from("luma_guests").select("guest_id").eq("email", email).limit(1).maybeSingle());
  if (guest) return { kind: "registered" };

  const guestId = check(await admin.rpc("luma_guest_for_claude_email", { p_email: email }));
  if (typeof guestId === "string") {
    const g = check(await admin.from("luma_guests").select("email").eq("guest_id", guestId).maybeSingle());
    if (g) return { kind: "claude", guestId, lumaEmail: g.email };
  }
  return { kind: "unregistered" };
}

// classify(), or null after logging when a lookup failed.
async function tryClassify(email: string) {
  try {
    return await classify(email);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return null;
  }
}

// Whether this email may create an account: registration is open (lib/registration.ts), or the
// guest checked in on Luma, so attendees can still sign in to upload photos after it closes.
async function mayCreateAccount(email: string) {
  const admin = createAdminClient();
  const { data: settings } = await admin.from("event_settings").select("*").eq("id", 1).maybeSingle();
  if (registrationOpen(registrationMode(settings?.registration), settings?.event_ends_at)) return true;
  const { data: guest } = await admin.from("luma_guests").select("guest_id").eq("email", email).not("checked_in_at", "is", null).limit(1).maybeSingle();
  return Boolean(guest);
}

const LOOKUP_FAILED = "We couldn't check that email just now. Wait a few seconds and try again.";

// Sends a magic link to the typed email if it has an account or is a Luma registration email.
// Otherwise it says which email to use instead, and the page offers a sign-in request.
// Within RESEND_AFTER_SECONDS of the last link, it reports that link instead of sending.
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const typed = normalizeEmail(formData.get("email"));
  if (!isValidEmail(typed)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const what = await tryClassify(typed);
  if (!what) return { status: "error", message: LOOKUP_FAILED };
  if (what.kind === "registered" && !(await mayCreateAccount(typed))) {
    return { status: "not_sent", reason: "closed", typed, useInstead: null };
  }
  if (what.kind === "linked" || what.kind === "claude" || what.kind === "unregistered") {
    const { data: request, error } = await createAdminClient()
      .from("login_requests")
      .select("status")
      .eq("email", typed)
      .maybeSingle();
    if (error) console.error("login lookup failed (login_requests):", error.message);
    // A new sign-in request would create an account, so it's offered only while registration is open.
    const closed = what.kind !== "linked" && !request && !(await mayCreateAccount(typed));
    const reason =
      request?.status === "pending" ? "requested" : request?.status === "declined" ? "declined" : closed ? "closed" : what.kind;
    const useInstead =
      what.kind === "linked" ? maskEmail(what.authEmail) : what.kind === "claude" ? maskEmail(what.lumaEmail) : null;
    return { status: "not_sent", reason, typed, useInstead };
  }

  const sent = (sentAt: number, alreadySent: boolean): LoginState => ({
    status: "sent",
    address: typed,
    sentAt: new Date(sentAt).toISOString(),
    resendAt: new Date(sentAt + RESEND_AFTER_SECONDS * 1000).toISOString(),
    alreadySent,
  });

  // Remembered for the sign-in routes; the link itself can't carry it (lib/sign-in-next.ts).
  const next = safeNextPath(formData.get("next"));
  if (next) {
    (await cookies()).set(SIGN_IN_NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: SIGN_IN_NEXT_MAX_AGE });
  }

  const lastSent = what.kind === "account" ? liveLinkSentAt(what.user) : null;
  if (lastSent && Date.now() - lastSent < RESEND_AFTER_SECONDS * 1000) return sent(lastSent, true);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: typed,
    // The email templates link to {{ .RedirectTo }}?token_hash=…, so this also
    // decides which deployment (localhost, preview, production) the link opens.
    // Only a Luma registration that passed mayCreateAccount() above may create its account here.
    options: { emailRedirectTo: `${await getOrigin()}/auth/confirm`, shouldCreateUser: what.kind === "registered" },
  });
  if (error) {
    // Supabase's own per-account limit says how long to wait ("…after 42 seconds").
    const wait = error.message.match(/after (\d+) seconds?/)?.[1];
    return {
      status: "error",
      message: wait
        ? `We just sent a sign-in link to this address. Check your inbox and spam folder, or try again in ${wait} seconds.`
        : error.status === 429
          ? "Too many sign-in emails right now. Wait a minute and try again."
          : "We couldn't send the sign-in link. Try again in a minute.",
    };
  }

  return sent(Date.now(), false);
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Emails every (non-test) admin about a new sign-in request. Failures are logged, not shown:
// the request is saved either way and appears in Admin -> People.
async function notifyAdmins(email: string, name: string, lumaEmail: string | null) {
  const admin = createAdminClient();
  const { data: admins } = await admin.from("profiles").select("id").eq("platform_role", "admin").eq("is_test", false);
  const { data: inboxes } = await admin
    .from("profile_emails")
    .select("email")
    .eq("is_default", true)
    .in("profile_id", (admins ?? []).map((a) => a.id));
  const url = `${await getOrigin()}/admin/people`;
  const registration = lumaEmail
    ? `It's the Claude account email on the Luma registration for ${lumaEmail}; they say they can't use that inbox.`
    : "This email isn't on the Luma guest list. Approving also gives them full access.";
  await Promise.all(
    (inboxes ?? []).map(({ email: to }) =>
      sendEmail({
        to,
        subject: `Sign-in request: ${name} (${email})`,
        text: `${name} asked to sign in with ${email}. ${registration}\n\nApprove or decline: ${url}`,
        html: `<p><strong>${escapeHtml(name)}</strong> asked to sign in with ${escapeHtml(email)}.</p><p>${escapeHtml(registration)}</p><p><a href="${url}">Approve or decline in Admin → People</a></p>`,
      }).catch((error) => console.error("sign-in request: admin email failed", error)),
    ),
  );
}

// Saves a request to sign in with an email that can't get a link by itself (a Claude-account
// email or one that isn't on Luma). No link is sent until an admin approves it.
export async function requestAccess(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const email = normalizeEmail(formData.get("email"));
  const name = typeof formData.get("name") === "string" ? (formData.get("name") as string).trim() : "";
  if (!isValidEmail(email)) return { status: "error", message: "Enter a valid email address." };
  if (!name) return { status: "error", message: "Enter your name so the organizers know who's asking." };
  if (name.length > 200) return { status: "error", message: "That name is too long." };
  if (formData.get("ack") !== "on") {
    return { status: "error", message: "Check the box to confirm you'll wait for an organizer's approval." };
  }

  const what = await tryClassify(email);
  if (!what) return { status: "error", message: LOOKUP_FAILED };
  if (what.kind === "account" || what.kind === "registered") {
    return { status: "error", message: "This email can already sign in. Go back and request a sign-in link." };
  }
  if (what.kind === "linked") {
    return { status: "error", message: "This email is linked to an account. Sign in with that account's email." };
  }

  if (!(await mayCreateAccount(email))) {
    return { status: "error", message: "New accounts are closed now that the event is over." };
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("login_requests")
    .upsert(
      { email, name, luma_guest_id: what.kind === "claude" ? what.guestId : null },
      { onConflict: "email", ignoreDuplicates: true },
    )
    .select("email");
  if (error) return { status: "error", message: "We couldn't save your request. Try again in a minute." };

  if (inserted?.length) {
    await notifyAdmins(email, name, what.kind === "claude" ? what.lumaEmail : null);
  } else {
    const { data: existing } = await admin.from("login_requests").select("status").eq("email", email).single();
    if (existing?.status === "declined") {
      return { status: "error", message: "An organizer declined a request for this email. Please find one at the event." };
    }
  }
  return { status: "requested", email };
}
