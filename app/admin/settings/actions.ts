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

// Optional event details: a blank field saves NULL, and the home page falls back to lib/event.ts.
function optionalText(formData: FormData, key: string) {
  return field(formData, key).trim() || null;
}

function optionalNumber(formData: FormData, key: string, label: string) {
  const value = field(formData, key).trim();
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} needs to be a number.`);
  return number;
}

function optionalPacific(formData: FormData, key: string, label: string) {
  const value = field(formData, key);
  if (!value) return null;
  const iso = pacificInputToIso(value);
  if (!iso) throw new Error(`${label} needs a date and time.`);
  return iso;
}

export async function saveEventSettings(formData: FormData) {
  await assertAdmin();
  const teamClose = pacificInputToIso(field(formData, "team_formation_closes_at"));
  const submitClose = pacificInputToIso(field(formData, "submissions_close_at"));
  if (!teamClose || !submitClose) throw new Error("Both deadlines need a date and time.");
  const startsAt = optionalPacific(formData, "event_starts_at", "Event start");
  const endsAt = optionalPacific(formData, "event_ends_at", "Event end");
  if (startsAt && endsAt && startsAt >= endsAt) throw new Error("The event has to end after it starts.");
  const lumaUrl = optionalText(formData, "luma_calendar_url");
  if (lumaUrl && !/^https?:\/\//.test(lumaUrl)) throw new Error("The Luma link needs to start with https://.");
  const insightsUrl = optionalText(formData, "business_insights_url");
  if (insightsUrl && !/^https:\/\//.test(insightsUrl)) throw new Error("The small business data link needs to start with https://.");

  const { error } = await createAdminClient()
    .from("event_settings")
    .update({
      team_formation_closes_at: teamClose,
      submissions_close_at: submitClose,
      publish_finalists: formData.get("publish_finalists") === "on",
      publish_winners: formData.get("publish_winners") === "on",
      event_starts_at: startsAt,
      event_ends_at: endsAt,
      venue_name: optionalText(formData, "venue_name"),
      venue_address: optionalText(formData, "venue_address"),
      venue_neighborhood: optionalText(formData, "venue_neighborhood"),
      venue_lat: optionalNumber(formData, "venue_lat", "Latitude"),
      venue_lon: optionalNumber(formData, "venue_lon", "Longitude"),
      luma_calendar_url: lumaUrl,
      business_insights_url: insightsUrl,
      wifi_network: optionalText(formData, "wifi_network"),
      wifi_password: optionalText(formData, "wifi_password"),
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
