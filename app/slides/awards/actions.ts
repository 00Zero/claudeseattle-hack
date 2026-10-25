"use server";

import { revalidatePath } from "next/cache";
import { assertSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

// The publish buttons at the end of the awards deck's finalist and winner parts. Same switches as
// "Publish finalists" / "Publish winners" on /admin/judging (event_settings); /results shows only
// what's on. Turning one off again is done there.
export async function publishResults(field: "publish_finalists" | "publish_winners") {
  await assertSuperAdmin();
  if (field !== "publish_finalists" && field !== "publish_winners") throw new Error("Bad request.");
  const { error } = await createAdminClient().from("event_settings").update({ [field]: true }).eq("id", 1);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/results");
  revalidatePath("/admin/judging");
  revalidatePath("/slides/awards");
  return { ok: true as const };
}
