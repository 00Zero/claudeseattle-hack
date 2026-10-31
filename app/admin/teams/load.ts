import "server-only";
import { accessFromRules, type AccessRule } from "@/lib/access";
import { accountEmails, all } from "@/lib/followup/groups";
import { NO_NAME, titleAtCompany } from "@/app/(teams)/teams/_components/person";
import type { RoleBucket } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEST_GUEST_PREFIX } from "@/lib/test-accounts";
import type { DirectoryPerson, DirectoryTeam } from "./directory";

type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  luma_guest_id: string | null;
  luma_status: string | null;
  ticket_name: string | null;
  platform_role: string;
  role_bucket: RoleBucket | null;
  is_technical: boolean | null;
  job_title: string | null;
  company: string | null;
  checked_in_at: string | null;
};

type Guest = {
  guest_id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  claude_email: string | null;
  approval_status: string;
  ticket_name: string | null;
  checked_in_at: string | null;
  cancelled_at: string | null;
  job_title: string | null;
  company: string | null;
};

type Team = {
  id: string;
  name: string;
  concept: string | null;
  leader_id: string;
  team_members: { profile_id: string; status: string }[];
};

const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter(Boolean) as string[])];

// Everyone for /admin/teams, for a caller who has checked they're an admin: accounts plus Luma
// guests who never signed in (they have no profile, so People doesn't list them). Test accounts
// stay on /admin/test-accounts. Only profile fields, emails and Luma status go to the page;
// matching-only answers don't.
export async function loadDirectory(): Promise<{ teams: DirectoryTeam[]; people: DirectoryPerson[] }> {
  const admin = createAdminClient();
  const [profiles, guests, emails, signInEmails, { data: teamRows, error: teamsError }, { data: rules }] = await Promise.all([
    all<Profile>((a, b) =>
      admin
        .from("profiles")
        .select(
          "id, first_name, last_name, luma_guest_id, luma_status, ticket_name, platform_role, role_bucket, is_technical, job_title, company, checked_in_at",
        )
        .eq("is_test", false)
        .order("id")
        .range(a, b),
    ),
    all<Guest>((a, b) =>
      admin
        .from("luma_guests")
        .select(
          "guest_id, name, first_name, last_name, email, claude_email, approval_status, ticket_name, checked_in_at, cancelled_at, job_title, company",
        )
        .not("guest_id", "like", `${TEST_GUEST_PREFIX}%`)
        .order("guest_id")
        .range(a, b),
    ),
    all<{ profile_id: string; email: string; is_default: boolean }>((a, b) =>
      admin.from("profile_emails").select("profile_id, email, is_default").order("profile_id").order("email").range(a, b),
    ),
    accountEmails(admin),
    admin.from("teams").select("id, name, concept, leader_id, team_members(profile_id, status)").order("name"),
    admin.from("access_rules").select("ticket_name, approval_status, access, default_role"),
  ]);
  if (teamsError) throw new Error(teamsError.message);

  const realProfiles = new Set(profiles.map((p) => p.id));
  const teams = ((teamRows ?? []) as Team[]).filter((t) => realProfiles.has(t.leader_id)); // test teams have test leaders
  const teamOf = new Map<string, { team: Team; isLeader: boolean }>();
  for (const team of teams) {
    for (const m of team.team_members) {
      if (m.status === "member") teamOf.set(m.profile_id, { team, isLeader: m.profile_id === team.leader_id });
    }
  }

  const guestById = new Map(guests.map((g) => [g.guest_id, g]));
  const defaultEmail = new Map(emails.filter((e) => e.is_default).map((e) => [e.profile_id, e.email]));
  const otherEmails = new Map<string, string[]>();
  for (const e of emails) otherEmails.set(e.profile_id, [...(otherEmails.get(e.profile_id) ?? []), e.email]);

  const accounts: DirectoryPerson[] = profiles.map((p) => {
    const guest = p.luma_guest_id ? guestById.get(p.luma_guest_id) : undefined;
    const name = `${p.first_name} ${p.last_name}`.trim() || guest?.name?.trim() || NO_NAME;
    const work = titleAtCompany(p.job_title, p.company);
    const allEmails = distinct([
      defaultEmail.get(p.id),
      ...(otherEmails.get(p.id) ?? []),
      signInEmails.get(p.id),
      guest?.email,
      guest?.claude_email,
    ]);
    const onTeam = teamOf.get(p.id);
    return {
      id: p.id,
      hasAccount: true,
      name,
      work,
      email: allEmails[0] ?? null,
      ticket: p.ticket_name,
      platformRole: p.platform_role,
      roleBucket: p.role_bucket,
      technical: p.is_technical === true,
      status: p.luma_status,
      checkedIn: Boolean(p.checked_in_at ?? guest?.checked_in_at),
      isLeader: onTeam?.isLeader ?? false,
      team: onTeam ? { id: onTeam.team.id, name: onTeam.team.name } : null,
      // Same rule as joinableIds in the Teams app: participants and mentors with full access.
      canJoinTeam:
        (p.platform_role === "participant" || p.platform_role === "mentor") &&
        accessFromRules((rules ?? []) as AccessRule[], p.ticket_name, p.luma_status) === "full",
      search: [name, work, p.ticket_name, ...allEmails].filter(Boolean).join(" "),
    };
  });

  const linked = new Set(profiles.map((p) => p.luma_guest_id));
  const guestsOnly: DirectoryPerson[] = guests
    .filter((g) => !linked.has(g.guest_id))
    .map((g) => {
      const name = g.name?.trim() || `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim() || NO_NAME;
      const work = titleAtCompany(g.job_title, g.company);
      return {
        id: g.guest_id,
        hasAccount: false,
        name,
        work,
        email: g.email,
        ticket: g.ticket_name,
        platformRole: "participant",
        roleBucket: null,
        technical: false,
        status: g.cancelled_at ? "cancelled" : g.approval_status,
        checkedIn: Boolean(g.checked_in_at),
        isLeader: false,
        team: null,
        canJoinTeam: false,
        search: [name, work, g.ticket_name, g.email, g.claude_email].filter(Boolean).join(" "),
      };
    });

  const people = [...accounts, ...guestsOnly].sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(accounts.map((p) => [p.id, p]));
  return {
    people,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      concept: t.concept,
      // Leader first, then by name.
      members: t.team_members
        .filter((m) => m.status === "member" && byId.has(m.profile_id))
        .map((m) => byId.get(m.profile_id)!)
        .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name)),
    })),
  };
}
