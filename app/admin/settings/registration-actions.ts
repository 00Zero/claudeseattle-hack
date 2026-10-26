"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { REGISTRATION_MODES, type RegistrationMode } from "@/lib/registration";
import { createAdminClient } from "@/lib/supabase/admin";

// Whether new people can create an account (lib/registration.ts).
export async function setRegistration(formData: FormData) {
  await assertAdmin();
  const mode = formData.get("registration");
  if (!REGISTRATION_MODES.includes(mode as RegistrationMode)) throw new Error("Unknown registration setting");
  const { error } = await createAdminClient().from("event_settings").update({ registration: mode }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
}
