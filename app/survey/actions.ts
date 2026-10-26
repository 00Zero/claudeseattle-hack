"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkAnswers, type Group, type Role } from "@/lib/followup/survey";

export type SubmitResult = { ok: true } | { ok: false; message: string };

// Saves the survey for the invite behind this token. Answering again replaces the earlier answers.
// The token is the only check: it's in one person's email, like a magic link.
export async function submitSurvey(token: string, raw: unknown): Promise<SubmitResult> {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return { ok: false, message: "This survey link isn't valid." };
  const admin = createAdminClient();
  const { data: invite } = await admin.from("followup_invites").select("id, grp, role").eq("token", token).maybeSingle();
  if (!invite) return { ok: false, message: "This survey link isn't valid." };

  const checked = checkAnswers(invite.grp as Group, invite.role as Role, raw);
  if (!checked.ok) return checked;

  const { data: claims } = await (await createClient()).auth.getClaims();
  const now = new Date().toISOString();
  const { error } = await admin.from("followup_responses").upsert(
    { invite_id: invite.id, answers: checked.answers, signed_in_profile_id: claims?.claims.sub ?? null, updated_at: now },
    { onConflict: "invite_id" },
  );
  if (error) {
    console.error("Survey save failed", error.message);
    return { ok: false, message: "Your answers couldn't be saved. Try again in a minute." };
  }
  return { ok: true };
}
