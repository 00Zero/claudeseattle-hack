"use server";

import { createClient } from "@/lib/supabase/server";

// Saves the caller's top three, best first. cast_audience_vote() checks everything (checked in,
// voting open, finalists only, not their own team) and raises a message fit to show as is.
export async function castVote(ranking: string[]) {
  if (!Array.isArray(ranking) || ranking.length > 3 || !ranking.every((id) => typeof id === "string")) {
    return { ok: false as const, message: "Bad request." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cast_audience_vote", { p_ranking: ranking });
  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const };
}
