import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { landingPathAfterSignIn } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

const EMAIL_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];

// Completes a magic-link sign-in. The /auth/confirm page posts here (a POST,
// so link scanners that only open the URL don't use up the single-use token).
// A plain form post plus a 303 redirect reloads the whole page, so the nav is
// rendered fresh with the new session.
//   token_hash: links from our email templates; work in any browser or device.
//   code: links built from Supabase's default template (PKCE); only work in the
//         browser that requested the link.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  const code = form.get("code");
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  const supabase = await createClient();

  let userId: string | undefined;
  if (typeof tokenHash === "string" && tokenHash && EMAIL_TYPES.includes(type as EmailOtpType)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (!error) userId = data.user?.id;
  } else if (typeof code === "string" && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id;
  }

  if (!userId) return to("/login?error=link");
  return to(await landingPathAfterSignIn(userId));
}
