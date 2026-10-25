"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// The "Print my name tag" switch. It stays off after the event ends whatever it says (lib/name-tags.ts).
export async function setNameTagsEnabled(formData: FormData) {
  await assertAdmin();
  const enabled = formData.get("enabled") === "true";
  const { error } = await createAdminClient().from("event_settings").update({ name_tags_enabled: enabled }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
  revalidatePath("/profile");
}
