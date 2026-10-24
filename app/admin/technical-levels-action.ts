"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { suggestTechnicalLevels } from "@/lib/technical-rating";

// Bulk technical-level suggestions for one world (lib/technical-rating.ts). Runs about 40
// seconds per click; the section shows how many are left.
export async function suggestTechnicalLevelsAction(formData: FormData) {
  await assertAdmin();
  const world = formData.get("world") === "real" ? "real" : "test";
  const result = await suggestTechnicalLevels(world);
  console.info(`Technical rating bulk (${world})`, result);
  revalidatePath("/admin/people");
  revalidatePath("/admin/test-accounts");
}
