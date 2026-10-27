"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { renderEmail, sendBatch } from "@/lib/followup/emails";
import { accountEmails, computeRecipients } from "@/lib/followup/groups";
import { GROUPS, type Group, type Role } from "@/lib/followup/survey";
import { getTemplates } from "@/lib/followup/templates";
import { getOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Real sends only from production, so emails never carry localhost or preview links.
const PRODUCTION_ORIGIN = "https://hack.claudeseattle.org";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function group(formData: FormData): Group {
  const g = field(formData, "grp");
  if (!(GROUPS as readonly string[]).includes(g)) throw new Error("Unknown group.");
  return g as Group;
}

function links(origin: string, token: string | null, grp: Group, role: Role) {
  return {
    surveyUrl: token ? `${origin}/survey/${token}` : `${origin}/survey/preview?group=${grp}&role=${role}`,
    // The survey token lets the login page fill in their sign-in email (app/login/page.tsx).
    uploadUrl: token ? `${origin}/login?next=/resources&invite=${token}` : `${origin}/login?next=/resources`,
    resultsUrl: `${origin}/results`,
  };
}

// Builds or refreshes everyone's invite from the latest data. Invites already sent keep their group.
// An unsent invite that no longer matches anyone (say, its address changed to the account's sign-in
// email) is removed, unless someone already opened or answered its survey.
export async function prepareRecipients() {
  await assertAdmin();
  const admin = createAdminClient();
  const [recipients, { data: existing, error }, { data: answered }] = await Promise.all([
    computeRecipients(),
    admin.from("followup_invites").select("id, email, sent_at, first_visit_at"),
    admin.from("followup_responses").select("invite_id"),
  ]);
  if (error) throw new Error(error.message);
  const sent = new Set((existing ?? []).filter((i) => i.sent_at).map((i) => i.email));
  const rows = recipients.filter((r) => !sent.has(r.email));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: upsertError } = await admin.from("followup_invites").upsert(rows.slice(i, i + 500), { onConflict: "email" });
    if (upsertError) throw new Error(upsertError.message);
  }
  const current = new Set(recipients.map((r) => r.email));
  const kept = new Set((answered ?? []).map((r) => r.invite_id));
  const stale = (existing ?? []).filter((i) => !current.has(i.email) && !i.sent_at && !i.first_visit_at && !kept.has(i.id)).map((i) => i.id);
  if (stale.length) {
    const { error: deleteError } = await admin.from("followup_invites").delete().in("id", stale);
    if (deleteError) throw new Error(deleteError.message);
  }
  revalidatePath("/admin/email");
}

export async function saveTemplate(formData: FormData) {
  const profile = await assertAdmin();
  const subject = field(formData, "subject");
  // Browser forms send \r\n; store plain \n so the text matches the defaults.
  const body = field(formData, "body").replace(/\r\n?/g, "\n");
  if (!subject || !body) throw new Error("An email needs a subject and a body.");
  if (!body.includes("{survey_link}")) throw new Error("The body needs {survey_link}.");
  const { error } = await createAdminClient()
    .from("followup_emails")
    .upsert({ grp: group(formData), subject: subject.slice(0, 200), body: body.slice(0, 10000), updated_at: new Date().toISOString(), updated_by: profile.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/email");
}

// Back to the default text in lib/followup/emails.ts.
export async function resetTemplate(formData: FormData) {
  await assertAdmin();
  const { error } = await createAdminClient().from("followup_emails").delete().eq("grp", group(formData));
  if (error) throw new Error(error.message);
  revalidatePath("/admin/email");
}

// The group's email to the signed-in admin, with a preview survey link (nothing is saved from it).
export async function sendTest(formData: FormData) {
  const profile = await assertAdmin();
  const grp = group(formData);
  const role = (field(formData, "role") || "participant") as Role;
  const { data: claims } = await (await createClient()).auth.getClaims();
  const to = claims?.claims.email;
  if (!to) throw new Error("Your account has no email.");
  const template = (await getTemplates())[grp];
  const rendered = renderEmail(template, { firstName: profile.display_name?.split(/\s+/)[0] ?? null, role, ...links(await getOrigin(), null, grp, role) });
  await sendEmail({ to, subject: `[Test] ${rendered.subject}`, text: rendered.text, html: rendered.html });
}

// Sends the group's email to everyone in it who hasn't been sent one, 100 per Resend call.
export async function sendGroup(formData: FormData) {
  await assertAdmin();
  const origin = await getOrigin();
  if (origin !== PRODUCTION_ORIGIN) throw new Error(`Send from ${PRODUCTION_ORIGIN}/admin/email, so the links point to the live site.`);
  const grp = group(formData);
  const admin = createAdminClient();
  const [template, { data: invites, error }, accounts] = await Promise.all([
    getTemplates().then((t) => t[grp]),
    admin.from("followup_invites").select("id, email, first_name, role, token, profile_id").eq("grp", grp).is("sent_at", null).order("email"),
    accountEmails(admin),
  ]);
  const otherSignIn = (inv: { email: string; profile_id: string | null }) => {
    const account = inv.profile_id ? accounts.get(inv.profile_id) : undefined;
    return account && account !== inv.email ? account : null;
  };
  if (error) throw new Error(error.message);

  for (let i = 0; i < (invites ?? []).length; i += 100) {
    const chunk = invites!.slice(i, i + 100);
    const messages = chunk.map((inv) => ({ to: inv.email, ...renderEmail(template, { firstName: inv.first_name, role: inv.role as Role, signInEmail: otherSignIn(inv), ...links(origin, inv.token, grp, inv.role as Role) }) }));
    try {
      const ids = await sendBatch(messages, `followup-${chunk[0].id}-${chunk.length}`);
      const sentAt = new Date().toISOString();
      await Promise.all(chunk.map((inv, k) => admin.from("followup_invites").update({ resend_id: ids[k] ?? null, sent_at: sentAt, send_error: null }).eq("id", inv.id)));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Send failed";
      await admin.from("followup_invites").update({ send_error: message.slice(0, 500) }).in("id", chunk.map((inv) => inv.id));
      revalidatePath("/admin/email");
      throw new Error(`Stopped after ${i} emails: ${message}`);
    }
  }
  revalidatePath("/admin/email");
}
