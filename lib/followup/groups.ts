import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEST_GUEST_PREFIX } from "@/lib/test-accounts";
import type { Group, Role } from "./survey";

// Who gets which feedback email, from the Luma import and what happened on the site.
// "Came" means any sign of it: a Luma check-in, a printed name tag, or an approved standby check-in.
// Team membership alone doesn't count, since teams formed online before the event.

export const GROUP_INFO: Record<Group, { label: string; rule: string }> = {
  attended: { label: "Participants who came", rule: "Participant or standby ticket, approved, checked in on Luma, printed a name tag, or approved at standby check-in." },
  unsure: { label: "On a team, no check-in", rule: "Participant ticket, approved, on a team, but no check-in or name tag. The survey asks whether they came." },
  crew: { label: "Mentors, judges, volunteers", rule: "Mentor, Judge, Volunteer or Ambassador ticket, approved, with a check-in or name tag." },
  no_show: { label: "Approved, didn't come", rule: "Approved, no check-in, no name tag, not on a team. The survey asks whether they came." },
  late_cancel: { label: "Cancelled on the day", rule: "Cancelled on Luma on the event day (Pacific), from Luma's guest update emails." },
  standby: { label: "Standby, not admitted", rule: "Standby ticket still pending: they didn't come, or came and weren't placed." },
};

const ROLE_BY_TICKET: Record<string, Role> = {
  Participant: "participant",
  Standby: "standby",
  Mentor: "mentor",
  Judge: "judge",
  Volunteer: "volunteer",
  Ambassador: "ambassador",
};
const CREW: Role[] = ["mentor", "judge", "volunteer", "ambassador"];

export type Recipient = {
  email: string;
  first_name: string | null;
  luma_guest_id: string;
  profile_id: string | null;
  grp: Group;
  role: Role;
  happy_hour: boolean;
};

const pacificDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// Supabase returns at most 1,000 rows per request.
async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function computeRecipients(): Promise<Recipient[]> {
  const admin = createAdminClient();
  const [guests, profiles, tags, standby, members, { data: settings }] = await Promise.all([
    all<{ guest_id: string; email: string; first_name: string | null; name: string | null; ticket_name: string | null; approval_status: string; checked_in_at: string | null; cancelled_at: string | null; happy_hour_checked_in_at: string | null }>((a, b) =>
      admin.from("luma_guests").select("guest_id, email, first_name, name, ticket_name, approval_status, checked_in_at, cancelled_at, happy_hour_checked_in_at").order("guest_id").range(a, b),
    ),
    all<{ id: string; luma_guest_id: string | null; is_test: boolean | null; is_super_admin: boolean | null }>((a, b) =>
      admin.from("profiles").select("id, luma_guest_id, is_test, is_super_admin").order("id").range(a, b),
    ),
    all<{ profile_id: string }>((a, b) => admin.from("name_tag_prints").select("profile_id").order("profile_id").range(a, b)),
    all<{ profile_id: string; approved_at: string | null }>((a, b) => admin.from("standby_checkins").select("profile_id, approved_at").order("profile_id").range(a, b)),
    all<{ profile_id: string }>((a, b) => admin.from("team_members").select("profile_id").eq("status", "member").order("profile_id").range(a, b)),
    admin.from("event_settings").select("event_ends_at").eq("id", 1).single(),
  ]);

  const eventDay = settings?.event_ends_at ? pacificDay(settings.event_ends_at) : null;
  const profileByGuest = new Map(profiles.filter((p) => p.luma_guest_id).map((p) => [p.luma_guest_id!, p]));
  const tagged = new Set(tags.map((t) => t.profile_id));
  const admitted = new Set(standby.filter((s) => s.approved_at).map((s) => s.profile_id));
  const onTeam = new Set(members.map((m) => m.profile_id));

  const out = new Map<string, Recipient>();
  for (const g of guests) {
    if (g.guest_id.startsWith(TEST_GUEST_PREFIX)) continue;
    const profile = profileByGuest.get(g.guest_id);
    if (profile?.is_test || profile?.is_super_admin) continue;
    const role = ROLE_BY_TICKET[g.ticket_name ?? ""];
    const came = Boolean(g.checked_in_at) || (profile ? tagged.has(profile.id) || admitted.has(profile.id) : false);

    let grp: Group | null = null;
    if (g.approval_status === "approved" && role) {
      if (came) grp = CREW.includes(role) ? "crew" : "attended";
      else if (profile && onTeam.has(profile.id) && !CREW.includes(role)) grp = "unsure";
      else grp = "no_show";
    } else if (g.approval_status === "pending_approval" && role === "standby") {
      grp = "standby";
    } else if (g.cancelled_at && eventDay && pacificDay(g.cancelled_at) === eventDay) {
      grp = "late_cancel";
    }
    if (!grp) continue;

    const email = g.email.trim().toLowerCase();
    if (out.has(email)) continue;
    const firstName = g.first_name?.trim() || g.name?.trim().split(/\s+/)[0] || null;
    // A cancelled guest has no ticket role that matters; their questions don't depend on it.
    out.set(email, { email, first_name: firstName, luma_guest_id: g.guest_id, profile_id: profile?.id ?? null, grp, role: role ?? "participant", happy_hour: Boolean(g.happy_hour_checked_in_at) });
  }
  return [...out.values()];
}
