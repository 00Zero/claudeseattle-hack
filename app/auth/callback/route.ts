import { NextResponse, type NextRequest } from "next/server";
import { landingPathFor, type Access } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing: exchange the code for a session, then route by access
// (full -> home, or /profile until the profile is confirmed; profile_only -> /pending;
// blocked -> /declined).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!code) return to("/login?error=link");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=link");

  const [{ data: access }, { data: profile }] = await Promise.all([
    supabase.rpc("current_access"),
    supabase.from("profiles").select("profile_confirmed").eq("id", data.user.id).maybeSingle(),
  ]);
  return to(landingPathFor(access as Access | null, profile?.profile_confirmed ?? false));
}
