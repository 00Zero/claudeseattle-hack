import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { FOLLOWUP_FROM, PLACEHOLDERS, followupReplyTo, renderEmail } from "@/lib/followup/emails";
import { GROUP_INFO } from "@/lib/followup/groups";
import { GROUPS, type Group, type Role } from "@/lib/followup/survey";
import { getTemplates, type Template } from "@/lib/followup/templates";
import { getOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";
import { SubmitButton } from "../submit-button";
import { prepareRecipients, resetTemplate, saveTemplate, sendGroup, sendTest } from "./actions";
import { ConfirmButton } from "./confirm-button";

const input = "w-full rounded border border-foreground/20 bg-background px-2 py-1";
const button = "rounded bg-foreground px-3 py-1.5 text-sm text-background";
const secondary = "rounded border border-foreground/20 px-3 py-1.5 text-sm";

type Invite = {
  id: string;
  email: string;
  first_name: string | null;
  grp: Group;
  role: Role;
  sent_at: string | null;
  send_error: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  first_visit_at: string | null;
};

const DEFAULT_ROLES: Record<Group, Role[]> = {
  attended: ["participant", "standby"],
  unsure: ["participant"],
  crew: ["mentor", "judge", "volunteer"],
  no_show: ["participant"],
  late_cancel: ["participant"],
  standby: ["standby"],
};

function status(inv: Invite, answered: boolean) {
  if (answered) return "Answered";
  if (inv.bounced_at) return "Bounced";
  if (inv.complained_at) return "Marked as spam";
  if (inv.first_visit_at) return "Opened the survey";
  if (inv.opened_at) return "Opened the email";
  if (inv.delivered_at) return "Delivered";
  if (inv.sent_at) return "Sent";
  if (inv.send_error) return "Send failed";
  return "Not sent";
}

const pct = (n: number, of: number) => (of ? ` (${Math.round((100 * n) / of)}%)` : "");

function GroupCard({ grp, template, invites, answered, origin, live }: { grp: Group; template: Template; invites: Invite[]; answered: Set<string>; origin: string; live: boolean }) {
  const sent = invites.filter((i) => i.sent_at);
  const unsent = invites.filter((i) => !i.sent_at);
  const count = (pick: (i: Invite) => unknown) => sent.filter(pick).length;
  const responses = invites.filter((i) => answered.has(i.id)).length;
  const roles = [...new Set(invites.map((i) => i.role))];
  const previewRoles = roles.length ? roles : DEFAULT_ROLES[grp];
  const preview = renderEmail(template, {
    firstName: "Alex",
    role: previewRoles[0],
    surveyUrl: `${origin}/survey/preview?group=${grp}&role=${previewRoles[0]}`,
    uploadUrl: `${origin}/login?next=/resources`,
    resultsUrl: `${origin}/results`,
  });

  const stats = [
    ["Recipients", invites.length],
    ["Sent", sent.length],
    ["Delivered", `${count((i) => i.delivered_at)}${pct(count((i) => i.delivered_at), sent.length)}`],
    ["Opened email", `${count((i) => i.opened_at)}${pct(count((i) => i.opened_at), sent.length)}`],
    ["Opened survey", `${count((i) => i.first_visit_at)}${pct(count((i) => i.first_visit_at), sent.length)}`],
    ["Answered", `${responses}${pct(responses, sent.length)}`],
    ["Bounced", count((i) => i.bounced_at)],
    ["Spam reports", count((i) => i.complained_at)],
  ] as const;

  return (
    <section id={grp} className="scroll-mt-20 space-y-4 rounded border border-foreground/20 p-4">
      <div>
        <h2 className="text-lg font-semibold">{GROUP_INFO[grp].label}</h2>
        <p className="text-sm text-foreground/70">{GROUP_INFO[grp].rule}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-foreground/60">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Recipients ({invites.length})</summary>
        <div className="mt-2 max-h-80 overflow-auto rounded border border-foreground/10">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-background text-foreground/60">
              <tr>
                <th className="px-2 py-1 font-normal">Name</th>
                <th className="px-2 py-1 font-normal">Email</th>
                <th className="px-2 py-1 font-normal">Role</th>
                <th className="px-2 py-1 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-t border-foreground/10">
                  <td className="px-2 py-1">{inv.first_name}</td>
                  <td className="px-2 py-1">{inv.email}</td>
                  <td className="px-2 py-1">{inv.role}</td>
                  <td className="px-2 py-1" title={inv.send_error ?? undefined}>
                    {status(inv, answered.has(inv.id))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={saveTemplate} className="space-y-2">
          <input type="hidden" name="grp" value={grp} />
          <label className="grid gap-1 text-sm">
            Subject
            <input name="subject" required maxLength={200} defaultValue={template.subject} className={input} />
          </label>
          <label className="grid gap-1 text-sm">
            Body
            <textarea name="body" required rows={18} maxLength={10000} defaultValue={template.body} className={`${input} font-mono text-xs`} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton className={button}>Save email</SubmitButton>
            <span className="text-xs text-foreground/60">{template.edited ? `Edited ${formatPacific(template.updated_at!)}` : "Default text"}</span>
          </div>
        </form>
        <div className="space-y-2">
          <p className="text-sm">
            Preview <span className="text-foreground/60">(saved version, for Alex)</span>
          </p>
          <div className="rounded border border-foreground/10 bg-white p-4 text-black">
            <p className="mb-3 border-b border-black/10 pb-2 text-sm font-semibold">{preview.subject}</p>
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
          <p className="text-sm">
            Survey this group sees:{" "}
            {previewRoles.flatMap((r) => (grp === "attended" && r === "participant" ? [`${r}`, `${r}&hh=1`] : [r])).map((r, k) => (
              <span key={r}>
                {k > 0 && " · "}
                <Link href={`/survey/preview?group=${grp}&role=${r}`} target="_blank">
                  {r.replace("&hh=1", ", came to the happy hour")}
                </Link>
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-3">
        {template.edited && (
          <form action={resetTemplate}>
            <input type="hidden" name="grp" value={grp} />
            <ConfirmButton className={secondary} pendingText="Resetting…" confirm="Replace your edits with the default text?">
              Reset to default
            </ConfirmButton>
          </form>
        )}
        <form action={sendTest}>
          <input type="hidden" name="grp" value={grp} />
          <input type="hidden" name="role" value={previewRoles[0]} />
          <SubmitButton className={secondary} pendingText="Sending…">
            Send a test to me
          </SubmitButton>
        </form>
        <form action={sendGroup} className="ml-auto">
          <input type="hidden" name="grp" value={grp} />
          <ConfirmButton
            className={button}
            pendingText="Sending…"
            disabled={!live || unsent.length === 0}
            confirm={`Send "${template.subject}" to ${unsent.length} ${unsent.length === 1 ? "person" : "people"} in "${GROUP_INFO[grp].label}"? This can't be undone.`}
          >
            {unsent.length ? `Send to ${unsent.length} not yet sent` : "Everyone has been sent this"}
          </ConfirmButton>
        </form>
      </div>
    </section>
  );
}

// Admin -> Email: the post-event feedback emails, by group. Check each email and survey, send a test,
// then send. Delivery and opens come from Resend's webhook; survey visits and answers from /survey.
export default async function EmailPage() {
  await requireAdminPage();
  const admin = createAdminClient();
  const [templates, { data: inviteRows }, { data: responseRows }, origin] = await Promise.all([
    getTemplates(),
    admin
      .from("followup_invites")
      .select("id, email, first_name, grp, role, sent_at, send_error, delivered_at, opened_at, bounced_at, complained_at, first_visit_at")
      .order("first_name"),
    admin.from("followup_responses").select("invite_id"),
    getOrigin(),
  ]);
  const invites = (inviteRows ?? []) as Invite[];
  const answered = new Set((responseRows ?? []).map((r) => r.invite_id));
  const live = origin === "https://hack.claudeseattle.org";
  const webhook = Boolean(process.env.RESEND_WEBHOOK_SECRET);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Feedback email</h1>
        <p className="text-sm text-foreground/70">
          From <code>{FOLLOWUP_FROM}</code>, replies to <code>{followupReplyTo()}</code>. Each person gets their own survey link, so nobody has to sign in.
          Opens are counted only if open tracking is on for email.claudeseattle.org in Resend; keep click tracking off.
        </p>
        {!webhook && (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            Delivery and open counts need Resend&apos;s webhook: add RESEND_WEBHOOK_SECRET in Vercel (see .env.example). Survey visits and answers are counted
            either way.
          </p>
        )}
        {!live && <p className="text-sm text-foreground/70">Sending to a group works only on hack.claudeseattle.org. Tests work anywhere.</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <form action={prepareRecipients}>
            <SubmitButton className={button} pendingText="Updating…">
              Update recipient lists
            </SubmitButton>
          </form>
          <span className="text-sm text-foreground/70">
            {invites.length} people · {answered.size} answered · re-run after a Luma import; people already sent keep their group.
          </span>
          <Link href="/admin/email/answers" className="ml-auto text-sm">
            See answers →
          </Link>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer">Placeholders you can use in an email</summary>
          <ul className="mt-1 list-disc pl-5">
            {PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <code>{p.key}</code>: {p.meaning}. On a line by itself, a link becomes a button.
              </li>
            ))}
          </ul>
        </details>
      </div>
      {GROUPS.map((grp) => (
        <GroupCard key={grp} grp={grp} template={templates[grp]} invites={invites.filter((i) => i.grp === grp)} answered={answered} origin={origin} live={live} />
      ))}
    </div>
  );
}
