"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { FEEDBACK_AUDIENCES, type FeedbackAudience } from "@/lib/feedback";
import { createAdminClient } from "@/lib/supabase/admin";

// Who sees the feedback button (lib/feedback.ts).
export async function setFeedbackAudience(formData: FormData) {
  await assertAdmin();
  const audience = formData.get("audience");
  if (!FEEDBACK_AUDIENCES.includes(audience as FeedbackAudience)) throw new Error("Unknown feedback setting");
  const { error } = await createAdminClient().from("event_settings").update({ feedback_audience: audience }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
