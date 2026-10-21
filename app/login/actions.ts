"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, maskEmail, normalizeEmail } from "@/lib/email";
import { getOrigin } from "@/lib/site-url";

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
    }
  | { status: "error"; message: string };

// Sends a magic link. If the typed email is a verified email on an existing
// profile whose auth email differs, the link goes to the auth email instead,
// so every linked email logs into the same account. If it is the Claude-account
// email someone gave on their Luma registration, the link goes to their Luma
// email (or that account's auth email), so accounts start from the Luma email.
// "direct" skips the Luma redirect, for people who don't use that inbox.
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const typed = normalizeEmail(formData.get("email"));
  if (!isValidEmail(typed)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const admin = createAdminClient();
  const authEmailFor = async (email: string) => {
    const { data: owner } = await admin
      .from("profile_emails")
      .select("profile_id")
      .eq("email", email)
      .eq("verified", true)
      .maybeSingle();
    if (!owner) return null;
    const { data } = await admin.auth.admin.getUserById(owner.profile_id);
    return data.user?.email?.toLowerCase() ?? null;
  };

  let target = (await authEmailFor(typed)) ?? typed;
  let redirectedFrom: "linked" | "luma" | null = target !== typed ? "linked" : null;
  let directEmail: string | null = null;
  if (target === typed && formData.get("direct") !== "1") {
    const { data: lumaEmail } = await admin.rpc("luma_email_for_claude_email", { p_email: typed });
    if (typeof lumaEmail === "string") {
      const lumaAccount = await authEmailFor(lumaEmail);
      target = lumaAccount ?? lumaEmail.toLowerCase();
      redirectedFrom = "luma";
      if (!lumaAccount) directEmail = typed;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: target,
    // The email templates link to {{ .RedirectTo }}?token_hash=…, so this also
    // decides which deployment (localhost, preview, production) the link opens.
    options: { emailRedirectTo: `${await getOrigin()}/auth/confirm` },
  });
  if (error) {
    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many sign-in emails. Wait a minute and try again."
          : "We couldn't send the sign-in link. Try again in a minute.",
    };
  }

  return { status: "sent", shownAddress: redirectedFrom ? maskEmail(target) : typed, redirectedFrom, directEmail };
}
