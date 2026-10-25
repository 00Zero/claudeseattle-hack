"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { STANDBY_TICKET } from "@/lib/standby";
import { createAdminClient } from "@/lib/supabase/admin";

export type ApproveState = { status: "idle" | "ok" | "error"; message?: string; approvedIds?: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Takes the selected people off standby here: the same admin override as Approve on People
// (re-imports keep it), so the Standby/approved access rule gives them full access at once,
// whatever Luma says. The admin then bulk-approves the same emails on Luma.
export async function approveStandby(_prev: ApproveState, formData: FormData): Promise<ApproveState> {
  const me = await assertAdmin();
  const ids = [...new Set(formData.getAll("profile_id").filter((v): v is string => typeof v === "string" && UUID.test(v)))];
  if (!ids.length) return { status: "error", message: "Select someone first." };

  const admin = createAdminClient();
  const { data: approved, error } = await admin
    .from("profiles")
    .update({ status_override: "approved", luma_status: "approved" })
    .in("id", ids)
    .eq("ticket_name", STANDBY_TICKET)
    .eq("is_super_admin", false)
    .select("id");
  if (error) return { status: "error", message: `Couldn't approve: ${error.message}` };
  const approvedIds = (approved ?? []).map((p) => p.id as string);

  // Stamp the check-ins; someone approved without checking in gets no row.
  if (approvedIds.length) {
    await admin
      .from("standby_checkins")
      .update({ approved_at: new Date().toISOString(), approved_by: me.id })
      .in("profile_id", approvedIds)
      .is("approved_at", null);
  }
  revalidatePath("/admin/standby");
  revalidatePath("/admin/people");
  const skipped = ids.length - approvedIds.length;
  return {
    status: "ok",
    approvedIds,
    message: `Approved ${approvedIds.length} on the platform${skipped ? ` (${skipped} skipped: not on a Standby ticket)` : ""}. They have full access now; bulk-approve the same emails on Luma.`,
  };
}

export async function setStandbyCanSeeTeams(formData: FormData) {
  await assertAdmin();
  const enabled = formData.get("enabled") === "true";
  const { error } = await createAdminClient().from("event_settings").update({ standby_can_see_teams: enabled }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/standby");
  revalidatePath("/check-in");
}
