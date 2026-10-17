"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { landingPathAfterSignIn } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

const EMAIL_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];

// Completes a magic-link sign-in. Runs on a button press (POST), so email
// link scanners that open the URL don't use up the single-use token.
//   token_hash: links from our email templates; work in any browser or device.
//   code: links built from Supabase's default template (PKCE); only work in the
//         browser that requested the link.
export async function confirmSignIn(formData: FormData) {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  const code = formData.get("code");
  const supabase = await createClient();

  let userId: string | undefined;
  if (typeof tokenHash === "string" && tokenHash && EMAIL_TYPES.includes(type as EmailOtpType)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (!error) userId = data.user?.id;
  } else if (typeof code === "string" && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id;
  }

  if (!userId) redirect("/login?error=link");
  redirect(await landingPathAfterSignIn(userId));
}
