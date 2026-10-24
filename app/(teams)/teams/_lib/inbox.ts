import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "../_components/person";
import { NO_NAME, PERSON_COLUMNS } from "../_components/person";
import type { Viewer } from "./teams";

// The Inbox tab: invites and applications in both directions, all in-app (no email).
// Reads run as the viewer, so RLS decides what's visible: invitees and leaders see invites
// (teams_invites_read), anyone who can browse sees applications (members_read).
// When someone joins a team, the shared_expire_on_join trigger expires their other invites
// and withdraws their other applications, so "pending" here is always still actionable.

type SignedIn = Extract<Viewer, { signedIn: true }>;

export type InviteToMe = {
  teamId: string;
  teamName: string;
  concept: string | null;
  invitedBy: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
};

export type MyApplication = { teamId: string; teamName: string; status: "applied" | "rejected" | "left" };

export type Inbox = {
  myTeam: { id: string; name: string; iLead: boolean } | null;
  invitesToMe: InviteToMe[];
  applicationsToMyTeam: ProfileRow[];
  myApplications: MyApplication[];
  invitesISent: { profileId: string; name: string }[];
};

const fullName = (p: { first_name: string; last_name: string } | null) =>
  (p ? `${p.first_name} ${p.last_name}`.trim() : "") || NO_NAME;

export async function loadInbox(viewer: SignedIn): Promise<Inbox> {
  const supabase = await createClient();
  const me = viewer.profile.id;

  const [team, invites, applications] = await Promise.all([
    viewer.myTeamId
      ? supabase.from("teams").select("id, name, leader_id").eq("id", viewer.myTeamId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("teams_invites")
      .select("team_id, status, created_at, teams(name, concept), inviter:profiles!teams_invites_invited_by_fkey(first_name, last_name)")
      .eq("profile_id", me)
      .order("created_at", { ascending: false })
      .limit(20),
    // Applications only (joined_at is null): leaving a team you were on isn't an inbox item.
    supabase
      .from("team_members")
      .select("team_id, status, applied_at, teams(name)")
      .eq("profile_id", me)
      .in("status", ["applied", "rejected", "left"])
      .is("joined_at", null)
      .order("applied_at", { ascending: false })
      .limit(20),
  ]);

  const myTeam = team.data ? { id: team.data.id as string, name: team.data.name as string, iLead: team.data.leader_id === me } : null;

  let applicationsToMyTeam: ProfileRow[] = [];
  let invitesISent: Inbox["invitesISent"] = [];
  if (myTeam?.iLead) {
    const [applicants, sent] = await Promise.all([
      supabase
        .from("team_members")
        .select(`applied_at, profiles(${PERSON_COLUMNS})`)
        .eq("team_id", myTeam.id)
        .eq("status", "applied")
        .order("applied_at", { ascending: true }),
      supabase
        .from("teams_invites")
        .select("profile_id, invitee:profiles!teams_invites_profile_id_fkey(first_name, last_name)")
        .eq("team_id", myTeam.id)
        .eq("status", "pending"),
    ]);
    applicationsToMyTeam = ((applicants.data ?? []) as unknown as { profiles: ProfileRow | null }[])
      .map((row) => row.profiles)
      .filter((p): p is ProfileRow => p !== null);
    invitesISent = ((sent.data ?? []) as unknown as { profile_id: string; invitee: { first_name: string; last_name: string } | null }[]).map(
      (row) => ({ profileId: row.profile_id, name: fullName(row.invitee) }),
    );
  }

  return {
    myTeam,
    invitesToMe: ((invites.data ?? []) as unknown as {
      team_id: string;
      status: InviteToMe["status"];
      teams: { name: string; concept: string | null } | null;
      inviter: { first_name: string; last_name: string } | null;
    }[]).map((row) => ({
      teamId: row.team_id,
      teamName: row.teams?.name ?? "A team",
      concept: row.teams?.concept ?? null,
      invitedBy: fullName(row.inviter),
      status: row.status,
    })),
    applicationsToMyTeam,
    myApplications: ((applications.data ?? []) as unknown as { team_id: string; status: MyApplication["status"]; teams: { name: string } | null }[]).map(
      (row) => ({ teamId: row.team_id, teamName: row.teams?.name ?? "A team", status: row.status }),
    ),
    invitesISent,
  };
}

// Things waiting on the viewer: invites to accept (only while they're not on a team) and,
// for leaders, applications to answer. Shown as the Inbox tab's count.
export async function inboxCount(viewer: Viewer): Promise<number> {
  if (!viewer.signedIn) return 0;
  const supabase = await createClient();
  const [invites, team] = await Promise.all([
    viewer.myTeamId
      ? Promise.resolve({ count: 0 })
      : supabase
          .from("teams_invites")
          .select("team_id", { count: "exact", head: true })
          .eq("profile_id", viewer.profile.id)
          .eq("status", "pending"),
    viewer.myTeamId
      ? supabase.from("teams").select("leader_id").eq("id", viewer.myTeamId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  let applications = 0;
  if (viewer.myTeamId && team.data?.leader_id === viewer.profile.id) {
    const { count } = await supabase
      .from("team_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("team_id", viewer.myTeamId)
      .eq("status", "applied");
    applications = count ?? 0;
  }
  return (invites.count ?? 0) + applications;
}
