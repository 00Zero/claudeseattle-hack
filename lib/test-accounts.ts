// Test accounts: copies of approved guests that live in a separate "test world"
// (supabase/migrations/20261022210416_shared_test_accounts.sql). Real accounts never see them;
// admins manage them at /admin/test-accounts and can sign in as one.
//
// A copy is
// - the guest's luma_guests row under guest_id "test_<id>", with email test.<id>@example.com,
//   last name "Test", no Claude email, no LinkedIn URL and no check-in, so handle_new_user links
//   the new account to it and matching_profiles sees the guest's Luma answers;
// - an auth user with that email (confirmed, no email sent), whose profile then gets the real
//   LinkedIn URL, so matching_profiles joins the guest's LinkedIn enrichment. Survey answers
//   come from the original guest through matching_profiles.
// The LinkedIn URL goes on the profile, not the guest copy: survey_guest() links a survey to the
// one guest who gave its LinkedIn URL, and a second guest with that URL would unlink the real one.
//
// Shared by the admin page and scripts/test-accounts.ts, so it takes a service-role client.
import type { SupabaseClient } from "@supabase/supabase-js";

export const TEST_GUEST_PREFIX = "test_";

export const testEmail = (guestId: string) => `test.${guestId.toLowerCase()}@example.com`;

// Roles an admin can give a test account on /admin/test-accounts.
export const TEST_ROLES = ["participant", "mentor", "judge"] as const;

export type GuestRow = Record<string, unknown> & {
  guest_id: string;
  first_name: string | null;
  linkedin_url: string | null;
  ticket_name: string | null;
};

function check<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as NonNullable<T>;
}

// Tickets worth copying: the approved rule's default role is participant, mentor or judge.
// Volunteers aren't copied. Test judges only ever score test entries.
export async function copyTickets(admin: SupabaseClient): Promise<string[]> {
  const rules = check(
    await admin
      .from("access_rules")
      .select("ticket_name")
      .eq("approval_status", "approved")
      .in("default_role", ["participant", "mentor", "judge"]),
    "access rules",
  );
  return rules.map((r) => r.ticket_name);
}

// Approved real guests who can be copied, all or just the given ids.
export async function copyableGuests(admin: SupabaseClient, guestIds?: string[]): Promise<GuestRow[]> {
  let query = admin
    .from("luma_guests")
    .select("*")
    .eq("approval_status", "approved")
    .in("ticket_name", await copyTickets(admin))
    .not("guest_id", "like", `${TEST_GUEST_PREFIX}%`)
    .order("name");
  if (guestIds) query = query.in("guest_id", guestIds);
  return check(await query, "guests") as GuestRow[];
}

// Creates the test copy of a guest, or refreshes it if it exists. Returns the profile id.
export async function createTestAccount(admin: SupabaseClient, guest: GuestRow): Promise<string> {
  const copyId = TEST_GUEST_PREFIX + guest.guest_id;
  const email = testEmail(guest.guest_id);
  const fields = { ...guest };
  delete fields.imported_at;
  check(
    await admin.from("luma_guests").upsert(
      {
        ...fields,
        guest_id: copyId,
        email,
        claude_email: null,
        last_name: "Test",
        name: [guest.first_name, "Test"].filter(Boolean).join(" "),
        approval_status: "approved",
        linkedin_url: null,
        checked_in_at: null,
      },
      { onConflict: "guest_id" },
    ),
    "guest copy",
  );

  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .eq("luma_guest_id", copyId)
    .maybeSingle();
  if (existingError) throw new Error(`test profile: ${existingError.message}`);
  let profileId = existing?.id as string | undefined;
  if (!profileId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { test_account: true },
    });
    if (error) throw new Error(`Creating ${email}: ${error.message}`);
    profileId = data.user.id;
  }

  const profile = check(
    await admin
      .from("profiles")
      .update({ linkedin_url: guest.linkedin_url })
      .eq("id", profileId)
      .select("is_test")
      .single(),
    "test profile LinkedIn",
  );
  // handle_new_user links by email; if that ever fails, don't leave a real-world account behind.
  if (!profile.is_test) {
    await admin.auth.admin.deleteUser(profileId);
    throw new Error(`${email} didn't link to its guest copy, so it was deleted`);
  }
  return profileId;
}

// Deletes the given test accounts (all of them when omitted): teams they lead (and those teams'
// entries; judge_entries.team_id doesn't cascade), their users (profiles, memberships, invites
// cascade) and their guest copies. Refuses ids that aren't test accounts.
export async function deleteTestAccounts(admin: SupabaseClient, profileIds?: string[]): Promise<number> {
  let query = admin.from("profiles").select("id, luma_guest_id, is_test");
  query = profileIds ? query.in("id", profileIds) : query.eq("is_test", true);
  const profiles = check(await query, "test profiles");
  if (profiles.some((p) => !p.is_test)) throw new Error("Only test accounts can be deleted here");

  for (let i = 0; i < profiles.length; i += 100) {
    const ids = profiles.slice(i, i + 100).map((p) => p.id);
    const teamIds = check(await admin.from("teams").select("id").in("leader_id", ids), "test teams").map((t) => t.id);
    if (teamIds.length) {
      check(await admin.from("judge_entries").delete().in("team_id", teamIds), "test entries");
      check(await admin.from("teams").delete().in("id", teamIds), "test teams");
    }
  }
  for (const p of profiles) {
    const { error } = await admin.auth.admin.deleteUser(p.id);
    if (error) throw new Error(`Deleting a test user: ${error.message}`);
  }

  const copies = profileIds
    ? admin.from("luma_guests").delete().in("guest_id", profiles.map((p) => p.luma_guest_id))
    : admin.from("luma_guests").delete().like("guest_id", `${TEST_GUEST_PREFIX}%`);
  check(await copies, "guest copies");
  return profiles.length;
}

// While an admin is signed in as a test account, this httpOnly cookie holds the admin's own
// refresh token so "Back to my account" can restore their session.
export const ADMIN_RETURN_COOKIE = "admin_return";
