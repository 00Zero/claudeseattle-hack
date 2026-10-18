import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/profile";

// Admin checks run on the server against the caller's own profile row.
// Every admin server action calls assertAdmin() before using the service-role client.

export async function getAdminProfile() {
  const profile = await getCurrentProfile();
  return profile?.platform_role === "admin" ? profile : null;
}

// For admin pages and layouts: signed out -> /login; not an admin -> 404.
export async function requireAdminPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.platform_role !== "admin") notFound();
  return profile;
}

// For admin server actions.
export async function assertAdmin() {
  const profile = await getAdminProfile();
  if (!profile) throw new Error("Not authorized");
  return profile;
}

// Super admins (profiles.is_super_admin) alone grant or remove the admin role
// and manage the admin email allowlist.
export async function assertSuperAdmin() {
  const profile = await assertAdmin();
  if (!profile.is_super_admin) throw new Error("Only a super admin can do that");
  return profile;
}
