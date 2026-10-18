"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { pacificInputToIso } from "@/lib/time";

const STATUSES = ["approved", "pending_approval", "waitlist", "declined"] as const;
const ACCESS = ["full", "profile_only", "blocked"];
const ROLES = ["participant", "mentor", "volunteer", "judge", "admin"];

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function saveEventSettings(formData: FormData) {
  await assertAdmin();
  const teamClose = pacificInputToIso(field(formData, "team_formation_closes_at"));
  const submitClose = pacificInputToIso(field(formData, "submissions_close_at"));
  if (!teamClose || !submitClose) throw new Error("Both deadlines need a date and time.");

  const { error } = await createAdminClient()
    .from("event_settings")
    .update({
      team_formation_closes_at: teamClose,
      submissions_close_at: submitClose,
      publish_finalists: formData.get("publish_finalists") === "on",
      publish_winners: formData.get("publish_winners") === "on",
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// One ticket's rules: an access level per approval status, plus its starting role.
export async function saveTicketRules(formData: FormData) {
  const me = await assertAdmin();
  const ticket = field(formData, "ticket_name").trim();
  const role = field(formData, "default_role");
  if (!ROLES.includes(role)) throw new Error("Unknown role");
  if (role === "admin" && !me.is_super_admin) throw new Error("Only a super admin can make a ticket start as admin");

  const rows = STATUSES.map((status) => {
    const access = field(formData, `access_${status}`);
    if (!ACCESS.includes(access)) throw new Error("Unknown access level");
    return { ticket_name: ticket, approval_status: status, access, default_role: role };
  });
  const { error } = await createAdminClient()
    .from("access_rules")
    .upsert(rows, { onConflict: "ticket_name,approval_status" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

// New ticket name from Luma: starts with approved = full, declined = blocked,
// everything else profile only.
export async function addTicket(formData: FormData) {
  const me = await assertAdmin();
  const ticket = field(formData, "ticket_name").trim();
  const role = field(formData, "default_role") || "participant";
  if (!ROLES.includes(role)) throw new Error("Unknown role");
  if (role === "admin" && !me.is_super_admin) throw new Error("Only a super admin can make a ticket start as admin");

  const rows = STATUSES.map((status) => ({
    ticket_name: ticket,
    approval_status: status,
    access: status === "approved" ? "full" : status === "declined" ? "blocked" : "profile_only",
    default_role: role,
  }));
  const { error } = await createAdminClient()
    .from("access_rules")
    .upsert(rows, { onConflict: "ticket_name,approval_status", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

export async function deleteTicket(formData: FormData) {
  await assertAdmin();
  const { error } = await createAdminClient()
    .from("access_rules")
    .delete()
    .eq("ticket_name", field(formData, "ticket_name"));
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}
