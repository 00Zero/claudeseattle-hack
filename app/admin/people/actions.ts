"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { getOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["participant", "mentor", "volunteer", "judge", "admin"];

export type RoleState = { status: "idle" | "ok" | "error"; message?: string };
export type RequestDecisionState = { status: "idle" | "ok" | "error"; message?: string };
export type AllowState = { status: "idle" | "ok" | "error"; message?: string };

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

// Emails a sign-in link to an account's sign-in email. Returns the error message, or null.
async function emailSignInLink(email: string) {
  const { error } = await createAdminClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await getOrigin()}/auth/confirm` },
  });
  return error?.message ?? null;
}

// The account a sign-in request should sign in to, creating it if needed:
// - one that already signs in with the email;
// - the account of the Luma registration whose Claude-account email this is, switched to sign
//   in with this email (the person said they can't use the Luma inbox);
// - otherwise a new account; the new-user trigger links it to that registration if it has none.
async function accountForRequest(email: string, lumaGuestId: string | null): Promise<string> {
  const admin = createAdminClient();
  // A failed lookup must stop here, or it would look like "no account" and create a second one.
  const { data: owner, error: ownerError } = await admin
    .from("profile_emails")
    .select("profile_id")
    .eq("email", email)
    .eq("verified", true)
    .maybeSingle();
  if (ownerError) throw new Error(`Couldn't check the email: ${ownerError.message}`);
  if (owner) {
    const { data, error } = await admin.auth.admin.getUserById(owner.profile_id);
    if (error) throw new Error(`Couldn't check the account: ${error.message}`);
    if (data.user?.email?.toLowerCase() !== email) throw new Error("That email is linked to another account's sign-in email.");
    return owner.profile_id;
  }

  if (lumaGuestId) {
    const { data: existing, error: existingError } = await admin
      .from("profiles")
      .select("id")
      .eq("luma_guest_id", lumaGuestId)
      .maybeSingle();
    if (existingError) throw new Error(`Couldn't check their registration: ${existingError.message}`);
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, { email, email_confirm: true });
      if (error) throw new Error(`Couldn't switch their account to this email: ${error.message}`);
      const { error: linkError } = await admin
        .from("profile_emails")
        .upsert({ profile_id: existing.id, email, verified: true, source: "claude" }, { onConflict: "profile_id,email" });
      if (linkError) throw new Error(`Couldn't link the email: ${linkError.message}`);
      return existing.id;
    }
  }

  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`Couldn't create the account: ${error?.message ?? "no user returned"}`);
  return data.user.id;
}

// Approve: set up the account (approved, if the email isn't on Luma), then email it a sign-in
// link. Decline: the login page tells them to find an organizer.
export async function decideLoginRequest(_prev: RequestDecisionState, formData: FormData): Promise<RequestDecisionState> {
  const me = await assertAdmin();
  const email = formData.get("email");
  const decision = formData.get("decision");
  if (typeof email !== "string" || (decision !== "approve" && decision !== "decline")) {
    return { status: "error", message: "Bad request." };
  }

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("login_requests")
    .select("email, luma_guest_id, status")
    .eq("email", email)
    .maybeSingle();
  if (!request) return { status: "error", message: "Request not found." };
  const decide = (status: "approved" | "declined") =>
    admin
      .from("login_requests")
      .update({ status, decided_at: new Date().toISOString(), decided_by: me.id })
      .eq("email", email);

  if (decision === "decline") {
    await decide("declined");
    revalidatePath("/admin/people");
    return { status: "ok", message: "Declined." };
  }

  let profileId: string;
  try {
    profileId = await accountForRequest(request.email, request.luma_guest_id);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Couldn't set up the account." };
  }
  const { data: profile } = await admin.from("profiles").select("luma_guest_id").eq("id", profileId).single();
  if (!profile?.luma_guest_id) {
    const { error } = await admin
      .from("profiles")
      .update({ status_override: "approved", luma_status: "approved" })
      .eq("id", profileId);
    if (error) return { status: "error", message: `Account created, but approving it failed: ${error.message}` };
  }
  await decide("approved");
  revalidatePath("/admin/people");

  const linkError = await emailSignInLink(request.email);
  if (linkError) {
    return {
      status: "error",
      message: `Approved, but the sign-in email failed (${linkError}). They can request a link at /login now.`,
    };
  }
  return { status: "ok", message: "Approved and sent a sign-in link." };
}

// Admin -> People, "Allow an email": lets someone in without a sign-in request. Same account rules
// as approving a request (accountForRequest): an account that already signs in with the email is
// reused; a Claude-account email switches its registration's account to it; anything else gets a
// new account (linked to its Luma registration by the new-user trigger, if it's a Luma email). The
// account is approved, a new one not on Luma gets the name typed here, and a sign-in link is
// emailed if asked. A pending sign-in request for the email is marked approved.
export async function allowEmail(_prev: AllowState, formData: FormData): Promise<AllowState> {
  const me = await assertAdmin();
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const email = normalizeEmail(formData.get("email"));
  const firstName = field("first_name");
  const lastName = field("last_name");
  if (!isValidEmail(email)) return { status: "error", message: "Enter a valid email address." };
  if (!firstName) return { status: "error", message: "Enter their first name." };
  if (firstName.length > 100 || lastName.length > 100) return { status: "error", message: "That name is too long." };

  const admin = createAdminClient();
  const { data: guestId, error: lookupError } = await admin.rpc("luma_guest_for_claude_email", { p_email: email });
  if (lookupError) return { status: "error", message: `Couldn't check Luma: ${lookupError.message}` };

  let profileId: string;
  try {
    profileId = await accountForRequest(email, typeof guestId === "string" ? guestId : null);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Couldn't set up the account." };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("first_name, luma_guest_id")
    .eq("id", profileId)
    .single();
  if (profileError) return { status: "error", message: `Couldn't read the account: ${profileError.message}` };
  const named = Boolean(profile.luma_guest_id) || Boolean(profile.first_name?.trim());
  const { error: approveError } = await admin
    .from("profiles")
    .update({
      ...(named ? {} : { first_name: firstName, last_name: lastName }),
      status_override: "approved",
      luma_status: "approved",
    })
    .eq("id", profileId);
  if (approveError) return { status: "error", message: `The account is set up, but approving it failed: ${approveError.message}` };

  await admin
    .from("login_requests")
    .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: me.id })
    .eq("email", email)
    .eq("status", "pending");
  revalidatePath("/admin/people");

  const where = profile.luma_guest_id ? " (linked to their Luma registration)" : "";
  const done = `Allowed ${email}${where}.`;
  if (formData.get("send_link") !== "on") return { status: "ok", message: `${done} They can sign in at /login with that email.` };
  const linkError = await emailSignInLink(email);
  if (linkError) return { status: "error", message: `${done} But the sign-in email failed (${linkError}); they can request one at /login.` };
  return { status: "ok", message: `${done} Sent them a sign-in link.` };
}
