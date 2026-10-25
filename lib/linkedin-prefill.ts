import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Suggestions for empty profile fields from the person's own LinkedIn enrichment (merged in
// linkedin_profiles, read through matching_profiles). Shown only on their own profile form,
// to accept or edit before saving; never saved automatically and never shown to anyone else.
// Service role, so callers pass only the signed-in user's own id.

export type LinkedinPrefill = { job_title: string | null; company: string | null; bio: string | null };

export async function getLinkedinPrefill(profileId: string): Promise<LinkedinPrefill> {
  const { data } = await createAdminClient()
    .from("matching_profiles")
    .select("linkedin_title, linkedin_company, linkedin_headline")
    .eq("profile_id", profileId)
    .maybeSingle();
  const clean = (value: unknown, max: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  return {
    job_title: clean(data?.linkedin_title, 200),
    company: clean(data?.linkedin_company, 200),
    bio: clean(data?.linkedin_headline, 300),
  };
}
