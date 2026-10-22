"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_RETURN_COOKIE,
  copyableGuests,
  createTestAccount,
  deleteTestAccounts,
  TEST_GUEST_PREFIX,
  TEST_ROLES,
} from "@/lib/test-accounts";
import { createTestProjects, formTestTeams } from "./simulate";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) throw new Error(`Missing ${name}`);
  return value;
}

export async function createTestCopy(formData: FormData) {
  await assertAdmin();
  const admin = createAdminClient();
  const [guest] = await copyableGuests(admin, [field(formData, "guest_id")]);
  if (!guest) throw new Error("That guest isn't approved with a team ticket");
  await createTestAccount(admin, guest);
  revalidatePath("/admin/test-accounts");
}

// Copies guests that have no test account yet, stopping after ~40 seconds so the request
// finishes; the page shows how many are left.
export async function createAllTestCopies() {
  await assertAdmin();
  const admin = createAdminClient();
  const { data: copies } = await admin.from("profiles").select("luma_guest_id").eq("is_test", true);
  const copied = new Set((copies ?? []).map((p) => p.luma_guest_id));
  const started = Date.now();
  for (const guest of await copyableGuests(admin)) {
    if (Date.now() - started > 40_000) break;
    if (!copied.has(TEST_GUEST_PREFIX + guest.guest_id)) await createTestAccount(admin, guest);
  }
  revalidatePath("/admin/test-accounts");
}

export async function deleteTestAccount(formData: FormData) {
  await assertAdmin();
  await deleteTestAccounts(createAdminClient(), [field(formData, "profile_id")]);
  revalidatePath("/admin/test-accounts");
}

export async function deleteAllTestAccounts() {
  await assertAdmin();
  await deleteTestAccounts(createAdminClient());
  revalidatePath("/admin/test-accounts");
}

async function testAccountEmail(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const { data: profile } = await admin.from("profiles").select("is_test").eq("id", profileId).single();
  if (!profile?.is_test) throw new Error("Only test accounts can be signed in as");
  const { data: user, error } = await admin.auth.admin.getUserById(profileId);
  if (error || !user.user.email) throw new Error("That test account has no sign-in email");
  return user.user.email;
}

async function testAccountTokenHash(admin: ReturnType<typeof createAdminClient>, profileId: string) {
  const email = await testAccountEmail(admin, profileId);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`Couldn't sign in as the test account: ${error.message}`);
  return data.properties.hashed_token;
}

export async function setTestRole(formData: FormData) {
  await assertAdmin();
  const role = field(formData, "role");
  if (!(TEST_ROLES as readonly string[]).includes(role)) throw new Error("Bad role");
  const admin = createAdminClient();
  const profileId = field(formData, "profile_id");
  await testAccountEmail(admin, profileId); // refuses real accounts
  const { error } = await admin.from("profiles").update({ platform_role: role }).eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/test-accounts");
}

export async function formTeams() {
  await assertAdmin();
  await formTestTeams(createAdminClient());
  revalidatePath("/admin/test-accounts");
}

export async function createProjects() {
  await assertAdmin();
  await createTestProjects(createAdminClient());
  revalidatePath("/admin/test-accounts");
  revalidatePath("/admin/judging");
}

export type LinkState = { url?: string; error?: string };

// A one-time sign-in link for a test account, to open on another device: for example a real
// judge rehearsing on their phone as a test judge. Same as an emailed magic link, so it works
// once and expires with the project's email-link lifetime.
export async function testSignInLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  await assertAdmin();
  try {
    const tokenHash = await testAccountTokenHash(createAdminClient(), field(formData, "profile_id"));
    return { url: `${await getOrigin()}/auth/confirm?token_hash=${tokenHash}&type=magiclink` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't make a link" };
  }
}

// Signs this browser in as a test account (never a real one), keeping the admin's own refresh
// token in an httpOnly cookie for returnToAdmin(). The admin's session stays valid meanwhile.
export async function viewAsTestAccount(formData: FormData) {
  await assertAdmin();
  const profileId = field(formData, "profile_id");
  const admin = createAdminClient();
  const tokenHash = await testAccountTokenHash(admin, profileId);
  const { data: profile } = await admin.from("profiles").select("platform_role").eq("id", profileId).single();

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_RETURN_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) {
    cookieStore.delete(ADMIN_RETURN_COOKIE);
    throw new Error(`Couldn't sign in as the test account: ${error.message}`);
  }
  redirect(profile?.platform_role === "judge" ? "/judge" : "/teams");
}

// From the test-account banner: ends the test session and restores the admin's own.
export async function returnToAdmin() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(ADMIN_RETURN_COOKIE)?.value;
  cookieStore.delete(ADMIN_RETURN_COOKIE);

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  if (!refreshToken) redirect("/login");
  const { error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  redirect(error ? "/login" : "/admin/test-accounts");
}
