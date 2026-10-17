import "server-only";
import { createClient } from "@/lib/supabase/server";

// Mirrors the access_level enum in 0001_shared.sql.
export type Access = "full" | "profile_only" | "blocked";

// The logged-in user's access level from access_rules (admins are always full).
// Null when signed out.
export async function getCurrentAccess(): Promise<Access | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_access");
  return (data as Access | null) ?? null;
}

export type AccessRule = { ticket_name: string; approval_status: string; access: Access; default_role: string };

// Same logic as access_for() in 0001_shared.sql, for listing many people at once.
export function accessFromRules(rules: AccessRule[], ticket: string | null, status: string | null): Access {
  const rule = rules.find((r) => r.ticket_name === (ticket ?? "") && r.approval_status === status);
  return rule?.access ?? (status === "declined" ? "blocked" : "profile_only");
}

// Where someone lands after logging in.
export function landingPathFor(access: Access | null, profileConfirmed: boolean) {
  if (access === "blocked") return "/declined";
  if (access !== "full") return "/pending";
  return profileConfirmed ? "/" : "/profile";
}

// Landing path for the user who just signed in on this request's session.
export async function landingPathAfterSignIn(userId: string) {
  const supabase = await createClient();
  const [{ data: access }, { data: profile }] = await Promise.all([
    supabase.rpc("current_access"),
    supabase.from("profiles").select("profile_confirmed").eq("id", userId).maybeSingle(),
  ]);
  return landingPathFor(access as Access | null, profile?.profile_confirmed ?? false);
}
