import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The logged-in user's profile row, or null when signed out.
// Cached per request, so layouts and pages can both call it.
// Throws when the read fails (for example the client's 10-second timeout), so a slow database
// shows the error page instead of treating a signed-in person as signed out.
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  return data;
});
