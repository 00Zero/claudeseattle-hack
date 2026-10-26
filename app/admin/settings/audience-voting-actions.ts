"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

function revalidate() {
  revalidatePath("/admin/settings");
  revalidatePath("/vote");
  revalidatePath("/");
  revalidatePath("/slides/awards");
}

// The audience voting feature switch (*_shared_audience_vote.sql). Off: /vote is a 404, the deck
// leaves out its audience slides, and nobody can vote.
export async function setAudienceVotingEnabled(formData: FormData) {
  await assertAdmin();
  const enabled = formData.get("enabled") === "true";
  const { error } = await createAdminClient().from("event_settings").update({ audience_voting_enabled: enabled }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidate();
}

// Opens or closes voting from Settings, the same switch as the awards deck's buttons.
export async function setAudienceVotingState(formData: FormData) {
  await assertAdmin();
  const state = formData.get("state");
  if (state !== "open" && state !== "closed") throw new Error("Bad request.");
  const { error } = await createAdminClient().from("event_settings").update({ audience_voting: state }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidate();
}
