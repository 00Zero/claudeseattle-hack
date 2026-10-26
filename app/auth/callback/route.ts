import { NextResponse, type NextRequest } from "next/server";
import { landingPathAfterSignIn } from "@/lib/access";
import { SIGN_IN_NEXT_COOKIE, safeNextPath } from "@/lib/sign-in-next";
import { createClient } from "@/lib/supabase/server";

// Older magic links (PKCE ?code=) land here. New links go to /auth/confirm.
// Exchange the code for a session, then route by access.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!code) return to("/login?error=link");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=link");

  const response = to(await landingPathAfterSignIn(data.user.id, safeNextPath(request.cookies.get(SIGN_IN_NEXT_COOKIE)?.value)));
  response.cookies.delete(SIGN_IN_NEXT_COOKIE);
  return response;
}
