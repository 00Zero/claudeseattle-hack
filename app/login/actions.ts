"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, maskEmail, normalizeEmail } from "@/lib/email";
import { getOrigin } from "@/lib/site-url";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; shownAddress: string; redirected: boolean }
  | { status: "error"; message: string };

// Sends a magic link. If the typed email is a verified email on an existing
// profile whose auth email differs, the link goes to the auth email instead,
// so every linked email logs into the same account.
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const typed = normalizeEmail(formData.get("email"));
  if (!isValidEmail(typed)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  let target = typed;
  const admin = createAdminClient();
  const { data: owner } = await admin
    .from("profile_emails")
    .select("profile_id")
    .eq("email", typed)
    .eq("verified", true)
    .maybeSingle();
  if (owner) {
    const { data } = await admin.auth.admin.getUserById(owner.profile_id);
    const authEmail = data.user?.email?.toLowerCase();
    if (authEmail && authEmail !== typed) target = authEmail;
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

  const redirected = target !== typed;
  return { status: "sent", shownAddress: redirected ? maskEmail(target) : typed, redirected };
}
