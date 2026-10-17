import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The logged-in user's profile row, or null when signed out.
// Cached per request, so layouts and pages can both call it.
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
});
