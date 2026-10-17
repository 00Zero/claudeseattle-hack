"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["participant", "mentor", "volunteer", "judge", "admin"];

function profileId(formData: FormData) {
  const id = formData.get("profile_id");
  if (typeof id !== "string" || !id) throw new Error("Missing profile_id");
  return id;
}

async function setOverride(id: string, status: "approved" | "declined") {
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ status_override: status, luma_status: status })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/people");
}

export async function approvePerson(formData: FormData) {
  await assertAdmin();
  await setOverride(profileId(formData), "approved");
}

export async function declinePerson(formData: FormData) {
  await assertAdmin();
  await setOverride(profileId(formData), "declined");
}

// Back to whatever Luma says (pending if they aren't in Luma).
export async function clearOverride(formData: FormData) {
  await assertAdmin();
  const id = profileId(formData);
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("luma_guest_id").eq("id", id).single();
  let status = "pending_approval";
  if (profile?.luma_guest_id) {
    const { data: guest } = await admin
      .from("luma_guests")
      .select("approval_status")
      .eq("guest_id", profile.luma_guest_id)
      .single();
    status = guest?.approval_status ?? status;
  }
  const { error } = await admin.from("profiles").update({ status_override: null, luma_status: status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/people");
}

export async function setPlatformRole(formData: FormData) {
  const me = await assertAdmin();
  const id = profileId(formData);
  const role = formData.get("platform_role");
  if (typeof role !== "string" || !ROLES.includes(role)) throw new Error("Unknown role");
  if (id === me.id && role !== "admin") throw new Error("You can't remove your own admin role.");
  const { error } = await createAdminClient().from("profiles").update({ platform_role: role }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/people");
}
