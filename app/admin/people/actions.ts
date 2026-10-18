"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["participant", "mentor", "volunteer", "judge", "admin"];

export type RoleState = { status: "idle" | "ok" | "error"; message?: string };

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

// Admins set participant, mentor, volunteer, and judge. Granting or removing
// admin takes a super admin. Super admins can't be changed at all (a database
// trigger enforces that too).
export async function setPlatformRole(_prev: RoleState, formData: FormData): Promise<RoleState> {
  const me = await assertAdmin();
  const id = profileId(formData);
  const role = formData.get("platform_role");
  if (typeof role !== "string" || !ROLES.includes(role)) return { status: "error", message: "Unknown role." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("platform_role, is_super_admin").eq("id", id).single();
  if (!target) return { status: "error", message: "Person not found." };
  if (target.is_super_admin) return { status: "error", message: "Super admins can't be changed." };
  if (target.platform_role === role) return { status: "ok" };
  if ((role === "admin" || target.platform_role === "admin") && !me.is_super_admin) {
    return { status: "error", message: "Only a super admin can grant or remove admin." };
  }

  const { error } = await admin.from("profiles").update({ platform_role: role }).eq("id", id);
  if (error) return { status: "error", message: "Couldn't save the role. Try again." };
  revalidatePath("/admin/people");
  return { status: "ok", message: "Saved." };
}
