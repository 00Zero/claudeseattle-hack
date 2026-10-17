import { NextResponse, type NextRequest } from "next/server";
import { landingPathAfterSignIn } from "@/lib/access";
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

  return to(await landingPathAfterSignIn(data.user.id));
}
