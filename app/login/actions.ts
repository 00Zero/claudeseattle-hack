"use server";

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, maskEmail, normalizeEmail } from "@/lib/email";
import { getOrigin } from "@/lib/site-url";

// How long after a link is sent before we send another to the same account. Supabase keeps
// one live link per account, so a new link cancels the one still on its way; people who
// asked again while the first email was slow then clicked a dead link.
const RESEND_AFTER_SECONDS = 5 * 60;

export type LoginState =
  | { status: "idle" }
  | {
      status: "sent";
      shownAddress: string;
      // linked: the typed email is verified on an account with another auth email.
      // luma: the typed email is the Claude-account email on a Luma registration.
      redirectedFrom: "linked" | "luma" | null;
      // The typed email, when it may sign in on its own instead (no account has the Luma email yet).
      directEmail: string | null;
      // When the live link was sent, and when a new one may be requested (ISO times).
      sentAt: string;
      resendAt: string;
      // True when a link sent earlier is still on its way, so none was sent this time.
      alreadySent: boolean;
      // What to post to request a new link once resendAt has passed.
      resend: { email: string; direct: boolean };
    }
  | { status: "error"; message: string };

// When this account's live sign-in link was sent: a magic link (recovery_sent_at) or, for an
// account that hasn't signed in yet, the signup confirmation. Null once that link was used.
function liveLinkSentAt(user: User | null) {
  const sent = Math.max(
    user?.recovery_sent_at ? Date.parse(user.recovery_sent_at) : 0,
    user?.confirmation_sent_at ? Date.parse(user.confirmation_sent_at) : 0,
  );
  const signedIn = user?.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  return sent > signedIn ? sent : null;
}

// Sends a magic link. If the typed email is a verified email on an existing
// profile whose auth email differs, the link goes to the auth email instead,
// so every linked email logs into the same account. If it is the Claude-account
// email someone gave on their Luma registration, the link goes to their Luma
// email (or that account's auth email), so accounts start from the Luma email.
// "direct" skips the Luma redirect, for people who don't use that inbox.
// Within RESEND_AFTER_SECONDS of the last link, it reports that link instead of sending.
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const typed = normalizeEmail(formData.get("email"));
  if (!isValidEmail(typed)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const direct = formData.get("direct") === "1";

  const admin = createAdminClient();
  const accountFor = async (email: string) => {
    const { data: owner } = await admin
      .from("profile_emails")
      .select("profile_id")
      .eq("email", email)
      .eq("verified", true)
      .maybeSingle();
    if (!owner) return null;
    const { data } = await admin.auth.admin.getUserById(owner.profile_id);
    return data.user;
  };

  let account = await accountFor(typed);
  let target = account?.email?.toLowerCase() ?? typed;
  let redirectedFrom: "linked" | "luma" | null = target !== typed ? "linked" : null;
  let directEmail: string | null = null;
  if (target === typed && !direct) {
    const { data: lumaEmail } = await admin.rpc("luma_email_for_claude_email", { p_email: typed });
    if (typeof lumaEmail === "string") {
      account = await accountFor(lumaEmail.toLowerCase());
      target = account?.email?.toLowerCase() ?? lumaEmail.toLowerCase();
      redirectedFrom = "luma";
      if (!account) directEmail = typed;
    }
  }

  const sent = (sentAt: number, alreadySent: boolean): LoginState => ({
    status: "sent",
    shownAddress: redirectedFrom ? maskEmail(target) : typed,
    redirectedFrom,
    directEmail,
    sentAt: new Date(sentAt).toISOString(),
    resendAt: new Date(sentAt + RESEND_AFTER_SECONDS * 1000).toISOString(),
    alreadySent,
    resend: { email: typed, direct },
  });

  const lastSent = liveLinkSentAt(account);
  if (lastSent && Date.now() - lastSent < RESEND_AFTER_SECONDS * 1000) return sent(lastSent, true);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: target,
    // The email templates link to {{ .RedirectTo }}?token_hash=…, so this also
    // decides which deployment (localhost, preview, production) the link opens.
    options: { emailRedirectTo: `${await getOrigin()}/auth/confirm` },
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
