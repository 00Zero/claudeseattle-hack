import "server-only";
import { getCurrentAccess, type Access } from "@/lib/access";
import { getMatchingProfiles } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";

// docs/REQUIREMENTS.md, "Teams app": 2–6 enforced, 3–5 recommended.
export const TEAM_MIN = 2;
export const TEAM_MAX = 6;
export const IDEAL_MIN = 3;
export const IDEAL_MAX = 5;

export type { RoleBucket } from "@/lib/roles";
import type { RoleBucket } from "@/lib/roles";

// What the balance badges need about one member. Same shape from the
// logged-in tables and from the public_team_members view.
export type MemberTraits = {
  role_bucket: RoleBucket | null;
  is_technical: boolean | null;
  is_mentor: boolean;
};

export type Balance = { owner: boolean; professional: boolean; student: boolean; technical: boolean };

// Balanced = at least one owner, professional, student, and technical member.
// Mentors don't count. Shown, never enforced.
export function balanceOf(members: MemberTraits[]): Balance {
  const counted = members.filter((m) => !m.is_mentor);
  return {
    owner: counted.some((m) => m.role_bucket === "owner"),
    professional: counted.some((m) => m.role_bucket === "professional"),
    student: counted.some((m) => m.role_bucket === "student"),
    technical: counted.some((m) => m.is_technical === true),
  };
}

export type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;

export type Viewer =
  | { signedIn: false }
  | {
      signedIn: true;
      profile: Profile;
      access: Access | null;
      // Why this person can't create or join a team; null when they can.
      joinBlockedReason: string | null;
      // The team they're a member of, if any.
      myTeamId: string | null;
    };

function joinBlockedReason(profile: Profile, access: Access | null) {
  if (access !== "full") return "Your registration is awaiting approval, so you can't join a team yet.";
  if (profile.platform_role === "volunteer") return "Volunteers help run the event, so they don't join teams.";
  if (profile.platform_role === "judge") return "Judges score the entries, so they don't join teams.";
  if (!profile.profile_confirmed) return "Confirm your profile first, so teams can see who you are.";
  return null;
}

export async function getViewer(): Promise<Viewer> {
  const profile = await getCurrentProfile();
  if (!profile) return { signedIn: false };

  const supabase = await createClient();
  const [access, { data: membership }] = await Promise.all([
    getCurrentAccess(),
    supabase.from("team_members").select("team_id").eq("profile_id", profile.id).eq("status", "member").maybeSingle(),
  ]);
  return {
    signedIn: true,
    profile,
    access,
    joinBlockedReason: joinBlockedReason(profile, access),
    myTeamId: membership?.team_id ?? null,
  };
}

// The team formation deadline from event_settings (readable by anyone).
export async function getFormationDeadline() {
  const supabase = await createClient();
  const { data } = await supabase.from("event_settings").select("team_formation_closes_at").eq("id", 1).maybeSingle();
  const closesAt: string | null = data?.team_formation_closes_at ?? null;
  return { closesAt, isPast: closesAt ? Date.now() > new Date(closesAt).getTime() : false };
}

export type TeamSummary = {
  id: string;
  name: string;
  concept: string | null;
  looking_for: string | null; // not in the public view, so null when signed out
  memberCount: number;
  balance: Balance;
};

type MemberRow = {
  status: string;
  profiles: { role_bucket: RoleBucket | null; is_technical: boolean | null; platform_role: string } | null;
};

function summarize(
  team: { id: string; name: string; concept: string | null; looking_for?: string | null },
  members: MemberTraits[],
): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    concept: team.concept,
    looking_for: team.looking_for ?? null,
    memberCount: members.length,
    balance: balanceOf(members),
  };
}

// Every team with its member count and balance. Logged-in people with full access read the
// tables (RLS: can_browse); everyone else reads the anonymous-safe public views.
export async function listTeams(fullAccess: boolean): Promise<TeamSummary[]> {
  const supabase = await createClient();

  if (fullAccess) {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, concept, looking_for, team_members(status, profiles(role_bucket, is_technical, platform_role))");
    if (error) throw error;
    return (data ?? []).map((team) =>
      summarize(
        team,
        (team.team_members as unknown as MemberRow[])
          .filter((m) => m.status === "member" && m.profiles)
          .map((m) => ({
            role_bucket: m.profiles!.role_bucket,
            is_technical: m.profiles!.is_technical,
            is_mentor: m.profiles!.platform_role === "mentor",
          })),
      ),
    );
  }

  const [teams, members] = await Promise.all([
    supabase.from("public_teams").select("id, name, concept"),
    supabase.from("public_team_members").select("team_id, role_bucket, is_technical, is_mentor"),
  ]);
  if (teams.error) throw teams.error;
  if (members.error) throw members.error;
  return (teams.data ?? []).map((team) =>
    summarize(
      team,
      (members.data ?? []).filter((m) => m.team_id === team.id),
    ),
  );
}

// Open teams (room for more) first, then fewest members, then by name.
export function sortTeams(teams: TeamSummary[]) {
  return [...teams].sort(
    (a, b) =>
      Number(a.memberCount >= TEAM_MAX) - Number(b.memberCount >= TEAM_MAX) ||
      a.memberCount - b.memberCount ||
      a.name.localeCompare(b.name),
  );
}

// Open invites to the current user, newest first (RLS: teams_invites_read).
export async function getMyInvites(profileId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams_invites")
    .select("team_id, created_at, teams(name)")
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    teamId: row.team_id as string,
    teamName: (row.teams as unknown as { name: string } | null)?.name ?? "A team",
  }));
}

// Who can be listed, invited, or added: people with full access (ticket rules in access_rules,
// so Luma approval, an admin's approval override, and admins all count) in the viewer's own
// world (real or test), as participants or mentors. Comes from matching_profiles, which
// computes access the same way the database does. Null if matching is unavailable.
export async function joinableIds(profileIds?: string[]): Promise<Set<string> | null> {
  try {
    const rows = await getMatchingProfiles(profileIds);
    return new Set(rows.filter((r) => r.platform_role === "participant" || r.platform_role === "mentor").map((r) => r.profile_id));
  } catch (error) {
    console.error("Couldn't read who can join teams", error);
    return null;
  }
}

// The teams_member_cap trigger's error, raised when a 7th member would join a team.
export function isTeamFull(error: { message?: string } | null | undefined) {
  return Boolean(error?.message?.includes("team_full"));
}
