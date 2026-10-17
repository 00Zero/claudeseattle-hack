"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, normalizeEmail, sendEmail } from "@/lib/email";
import { getOrigin } from "@/lib/site-url";

export type FormState = { status: "idle" | "ok" | "error"; message?: string };

const ROLE_BUCKETS = ["owner", "professional", "student"];
const VERIFY_HOURS = 24;

function text(formData: FormData, key: string, max = 200) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims.sub ?? null };
}

// "https://github.com/someone/" -> "someone"
function githubUsername(value: string) {
  return value.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/[/?#].*$/, "");
}

function linkedinUrl(value: string) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

// First-login confirmation and later edits. Only columns users may update
// (see the column grants in 0001_shared.sql); RLS limits it to their own row.
export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "error", message: "Your session expired. Log in again." };

  const firstName = text(formData, "first_name", 80);
  const lastName = text(formData, "last_name", 80);
  const roleBucket = text(formData, "role_bucket");
  const technical = text(formData, "is_technical");
  if (!firstName || !lastName) return { status: "error", message: "First and last name are required." };
  if (!ROLE_BUCKETS.includes(roleBucket)) return { status: "error", message: "Pick the role that fits you best." };
  if (technical !== "yes" && technical !== "no") {
    return { status: "error", message: "Tell us whether you're technical." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      role_bucket: roleBucket,
      is_technical: technical === "yes",
      job_title: text(formData, "job_title") || null,
      company: text(formData, "company") || null,
      linkedin_url: linkedinUrl(text(formData, "linkedin_url", 300)) || null,
      github_username: githubUsername(text(formData, "github_username", 300)) || null,
      bio: text(formData, "bio", 300) || null,
      interests: text(formData, "interests", 500) || null,
      looking_for: text(formData, "looking_for", 500) || null,
      profile_confirmed: true,
    })
    .eq("id", userId);
  if (error) return { status: "error", message: "We couldn't save your profile. Try again." };

  revalidatePath("/", "layout");
  return { status: "ok", message: "Saved." };
}

// Adds an unverified email and sends a single-use verification link (24 hours).
// Re-adding a pending email sends a fresh link.
export async function addEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const { userId } = await currentUserId();
  if (!userId) return { status: "error", message: "Your session expired. Log in again." };

  const email = normalizeEmail(formData.get("email"));
  if (!isValidEmail(email)) return { status: "error", message: "Enter a valid email address." };

  const admin = createAdminClient();
  const { data: verifiedOwner } = await admin
    .from("profile_emails")
    .select("profile_id")
    .eq("email", email)
    .eq("verified", true)
    .maybeSingle();
  if (verifiedOwner?.profile_id === userId) {
    return { status: "error", message: "That email is already on your account." };
  }
  if (verifiedOwner) {
    return { status: "error", message: "That email is already linked to another account." };
  }

  const token = randomBytes(32).toString("base64url");
  const { error } = await admin.from("profile_emails").upsert(
    {
      profile_id: userId,
      email,
      verified: false,
      is_default: false,
      source: "user",
      verify_token_hash: createHash("sha256").update(token).digest("hex"),
      verify_expires_at: new Date(Date.now() + VERIFY_HOURS * 3600 * 1000).toISOString(),
    },
    { onConflict: "profile_id,email" },
  );
  if (error) return { status: "error", message: "We couldn't add that email. Try again." };

  const link = `${await getOrigin()}/verify-email?token=${token}`;
  try {
    await sendEmail({
      to: email,
      subject: "Verify your email for the Claude Impact Lab Hackathon",
      text: `Verify this email to link it to your hackathon account:\n\n${link}\n\nThe link works once and expires in ${VERIFY_HOURS} hours. If you didn't ask for this, ignore this email.`,
      html: `<p>Verify this email to link it to your hackathon account:</p><p><a href="${link}">Verify email</a></p><p>The link works once and expires in ${VERIFY_HOURS} hours. If you didn't ask for this, ignore this email.</p>`,
    });
  } catch {
    return { status: "error", message: "We couldn't send the verification email. Try again in a minute." };
  }

  revalidatePath("/profile");
  return { status: "ok", message: `Verification link sent to ${email}.` };
}

// Makes a verified email the default and the account's auth email, so magic
// links and platform mail go there.
export async function makeDefaultEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "error", message: "Your session expired. Log in again." };

  const email = normalizeEmail(formData.get("email"));
  const { data: row } = await supabase
    .from("profile_emails")
    .select("verified, is_default")
    .eq("profile_id", userId)
    .eq("email", email)
    .maybeSingle();
  if (!row?.verified) return { status: "error", message: "Only verified emails can be the default." };
  if (row.is_default) return { status: "ok" };

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (authError) return { status: "error", message: "We couldn't switch your sign-in email. Try again." };

  const cleared = await admin.from("profile_emails").update({ is_default: false }).eq("profile_id", userId).eq("is_default", true);
  const set = cleared.error
    ? cleared
    : await admin.from("profile_emails").update({ is_default: true }).eq("profile_id", userId).eq("email", email);
  if (set.error) return { status: "error", message: "We couldn't update your default email. Try again." };

  revalidatePath("/profile");
  return { status: "ok", message: `${email} is now your default and sign-in email.` };
}
