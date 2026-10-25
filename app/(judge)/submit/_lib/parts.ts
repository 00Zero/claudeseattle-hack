// "Who did what": one part per teammate in judge_contributions. Used by the save action and by the
// form, which brings in teammates' saves as they land, so nothing here is server-only.
import type { SupabaseClient } from "@supabase/supabase-js";

// A part as saved: by is the profile id of whoever saved it last.
export type Part = { body: string; at: string | null; by: string | null };

export const EMPTY_PART: Part = { body: "", at: null, by: null };

type PartRow = { profile_id: string; body: string; updated_at: string; updated_by: string | null };

const PART_COLUMNS = "profile_id, body, updated_at, updated_by";

function toPart(row: PartRow): Part {
  return { body: row.body, at: row.updated_at, by: row.updated_by };
}

// The team's saved parts by teammate, read as the caller (RLS: team members and judges).
export async function loadParts(supabase: SupabaseClient, teamId: string): Promise<Map<string, Part>> {
  const { data } = await supabase.from("judge_contributions").select(PART_COLUMNS).eq("team_id", teamId);
  return new Map(((data ?? []) as PartRow[]).map((row) => [row.profile_id, toPart(row)]));
}

// One teammate's saved part.
export async function loadPart(supabase: SupabaseClient, teamId: string, profileId: string): Promise<Part> {
  const { data } = await supabase.from("judge_contributions").select(PART_COLUMNS).eq("team_id", teamId).eq("profile_id", profileId).maybeSingle();
  return data ? toPart(data as PartRow) : EMPTY_PART;
}

// Writes a teammate's part only if it's still the saved version the editor had (at: when it was
// saved, or null if it had never been saved). Null means someone saved it first.
export async function writePart(supabase: SupabaseClient, teamId: string, profileId: string, at: string | null, body: string): Promise<{ saved: Part | null; failed: boolean }> {
  const { data, error } = at
    ? await supabase.from("judge_contributions").update({ body }).eq("team_id", teamId).eq("profile_id", profileId).eq("updated_at", at).select(PART_COLUMNS)
    : await supabase.from("judge_contributions").insert({ team_id: teamId, profile_id: profileId, body }).select(PART_COLUMNS);
  // 23505: a teammate saved this part's first version first.
  if (error && error.code !== "23505") return { saved: null, failed: true };
  return { saved: data?.length ? toPart(data[0] as PartRow) : null, failed: false };
}
