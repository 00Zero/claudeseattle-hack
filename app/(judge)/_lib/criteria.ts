import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { criteriaKeys, enabledCriteria } from "./scoring";

// The criteria judges score this event: event_settings.judging_criteria (null = the default four),
// readable by anyone. Read separately from other settings so a missing column (a deploy that
// lands before its migration) falls back to the default instead of failing the page.
export async function getEnabledCriteria(client?: SupabaseClient) {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.from("event_settings").select("judging_criteria").eq("id", 1).maybeSingle();
  const stored = error ? null : ((data?.judging_criteria as string[] | null) ?? null);
  return { criteria: enabledCriteria(stored), keys: criteriaKeys(stored) };
}

// The setting is locked once any real-world score exists, so every score in a round uses the
// same criteria. Test-world scores (lib/test-accounts.ts) don't count. Service role only.
export async function criteriaLocked(admin: SupabaseClient) {
  const { count, error } = await admin
    .from("judge_scores")
    .select("entry_id, profiles!inner(is_test)", { count: "exact", head: true })
    .eq("profiles.is_test", false);
  // If the count can't be read, treat it as locked rather than risk changing criteria mid-round.
  return { locked: Boolean(error) || (count ?? 0) > 0, scores: count ?? 0, failed: Boolean(error) };
}
