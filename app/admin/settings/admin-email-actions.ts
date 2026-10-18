"use server";

import { revalidatePath } from "next/cache";
import { assertSuperAdmin } from "@/lib/admin";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

export type AllowlistState = { status: "idle" | "ok" | "error"; message?: string };

// Adds an email to the admin allowlist. A database trigger promotes whoever has
// it verified now, and anyone who verifies it later (see 0003_shared_admin_roles.sql).
export async function addAdminEmail(_prev: AllowlistState, formData: FormData): Promise<AllowlistState> {
  await assertSuperAdmin();
  const email = normalizeEmail(formData.get("email"));
  if (!isValidEmail(email)) return { status: "error", message: "Enter a valid email address." };
  const note = formData.get("note");

  const admin = createAdminClient();
  const { error } = await admin
    .from("admin_emails")
    .insert({ email, note: typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null });
  if (error?.code === "23505") return { status: "error", message: "That email is already on the list." };
  if (error) return { status: "error", message: "Couldn't add that email. Try again." };

  const { data: existing } = await admin.from("profile_emails").select("profile_id").eq("email", email).eq("verified", true).maybeSingle();
  revalidatePath("/admin", "layout");
  return {
    status: "ok",
    message: existing ? `Added. ${email} already has an account and is now an admin.` : `Added. ${email} becomes an admin when they sign up.`,
  };
}

// Removing an email doesn't demote anyone; change their role on the People tab.
export async function removeAdminEmail(formData: FormData) {
  await assertSuperAdmin();
  const email = normalizeEmail(formData.get("email"));
  const { error } = await createAdminClient().from("admin_emails").delete().eq("email", email);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
}
