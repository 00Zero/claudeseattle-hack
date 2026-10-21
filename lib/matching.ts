import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Team matching signals from the matching_profiles view (0005_shared_luma_matching.sql):
// profile fields, the Luma answers that never appear on profiles, and LinkedIn enrichment.
// Server-side only. Use them to rank people or teams, or as model input for a "why this
// fits" blurb; send the browser only what you derive, never these raw fields.
export type MatchingProfile = {
  profile_id: string;
  display_name: string;
  platform_role: string;
  role_bucket: string | null;
  is_technical: boolean | null;
  claude_code_level: string | null;
  job_title: string | null;
  company: string | null;
  bio: string | null;
  interests: string | null;
  looking_for: string | null;
  professional_role: string | null;
  employee_count: string | null;
  github_experience: string | null;
  why_join: string | null;
  features_interest: string | null;
  portfolio_url: string | null;
  linkedin_headline: string | null;
  linkedin_summary: string | null;
  linkedin_title: string | null;
  linkedin_company: string | null;
  linkedin_skills: string[] | null;
  linkedin_experiences: unknown;
  linkedin_education: unknown;
};

// Signals for the given profiles (all browsable people when omitted), for a caller who
// can browse. Only people with full access are returned. Throws for other callers.
export async function getMatchingProfiles(profileIds?: string[]): Promise<MatchingProfile[]> {
  const supabase = await createClient();
  const { data: canBrowse } = await supabase.rpc("can_browse");
  if (!canBrowse) throw new Error("Not authorized");

  let query = createAdminClient().from("matching_profiles").select("*").eq("access", "full");
  if (profileIds) query = query.in("profile_id", profileIds);
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't read matching profiles: ${error.message}`);
  return data as MatchingProfile[];
}
