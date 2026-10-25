// "Who did what": one part per teammate in judge_contributions. Used by the save action and by the
// form, which brings in teammates' saves as they land, so nothing here is server-only.
import type { SupabaseClient } from "@supabase/supabase-js";

// A part as saved: at is when its text was last saved (null = never written) and by is the profile
// id of whoever saved it. github: a username a teammate added for someone whose profile has none.
export type Part = { body: string; at: string | null; by: string | null; github?: string | null };

export const EMPTY_PART: Part = { body: "", at: null, by: null, github: null };

type PartRow = { profile_id: string; body: string; updated_at: string | null; updated_by: string | null; github_username: string | null };

const PART_COLUMNS = "profile_id, body, updated_at, updated_by, github_username";

function toPart(row: PartRow): Part {
  return { body: row.body, at: row.updated_at, by: row.updated_by, github: row.github_username };
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
// saved, or null if it had never been written). Null means someone saved it first.
export async function writePart(supabase: SupabaseClient, teamId: string, profileId: string, at: string | null, body: string): Promise<{ saved: Part | null; failed: boolean }> {
  const update = () =>
    supabase
      .from("judge_contributions")
      .update({ body })
      .eq("team_id", teamId)
      .eq("profile_id", profileId)
      .filter("updated_at", at ? "eq" : "is", at)
      .select(PART_COLUMNS);
  let { data, error } = at ? await update() : await supabase.from("judge_contributions").insert({ team_id: teamId, profile_id: profileId, body }).select(PART_COLUMNS);
  // 23505: the row exists (a teammate added a GitHub username, or saved first). Write it if its
  // text still hasn't been.
  if (error?.code === "23505") ({ data, error } = await update());
  if (error) return { saved: null, failed: true };
  return { saved: data?.length ? toPart(data[0] as PartRow) : null, failed: false };
}

// Adds a GitHub username for a teammate, creating their row if nobody wrote their part yet.
// False if it couldn't be saved.
export async function writeGithub(supabase: SupabaseClient, teamId: string, profileId: string, github: string) {
  const update = () => supabase.from("judge_contributions").update({ github_username: github }).eq("team_id", teamId).eq("profile_id", profileId).select("profile_id");
  let { data, error } = await update();
  if (!error && !data?.length) {
    ({ error } = await supabase.from("judge_contributions").insert({ team_id: teamId, profile_id: profileId, github_username: github }));
    // A teammate created the row meanwhile.
    if (error?.code === "23505") ({ data, error } = await update());
  }
  return !error;
}
