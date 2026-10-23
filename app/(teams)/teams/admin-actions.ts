"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./actions";
import { getViewer, isTeamFull, joinableIds, TEAM_MAX } from "./_lib/teams";

// Organizer tools on the team page: move, add, remove, hand over, delete. They run as the
// admin's own session; RLS allows admins everything on teams, team_members, and
// teams_invites (teams_admin, members_admin, teams_invites_admin). Each action checks the
// role first so non-admins get a clear message instead of a silent no-op.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && UUID.test(value) ? value : null;
}

async function adminSession() {
  const viewer = await getViewer();
  if (!viewer.signedIn || viewer.profile.platform_role !== "admin") return null;
  return createClient();
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function memberCount(supabase: Supabase, teamId: string) {
  const { count } = await supabase
    .from("team_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("status", "member");
  return count ?? 0;
}

// Makes the person a member of the team (new row, or an old applied/left/removed row
// reopened) and closes any open invite to it.
async function makeMember(supabase: Supabase, teamId: string, profileId: string) {
  // Not an upsert: only status and joined_at are updatable on team_members (column grant).
  const joinedAt = new Date().toISOString();
  const { data: existing } = await supabase
    .from("team_members")
    .select("status")
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .maybeSingle();
  const { error } = existing
    ? await supabase
        .from("team_members")
        .update({ status: "member", joined_at: joinedAt })
        .eq("team_id", teamId)
        .eq("profile_id", profileId)
    : await supabase
        .from("team_members")
        .insert({ team_id: teamId, profile_id: profileId, status: "member", joined_at: joinedAt });
  if (error) return error;
  await supabase
    .from("teams_invites")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .eq("status", "pending");
  return null;
}

function done(...teamIds: string[]): FormState {
  revalidatePath("/teams");
  revalidatePath("/teams/people");
  for (const teamId of teamIds) revalidatePath(`/teams/${teamId}`);
  return { status: "ok" };
}

const NOT_ADMIN: FormState = { status: "error", message: "Only organizers can do that." };
const BAD_INPUT: FormState = { status: "error", message: "Something went wrong. Reload and try again." };

// Move a member from this team to another. The leader can't be moved until someone else
// leads. Removes first (one team per person), then adds; puts them back if the add fails.
export async function adminMoveMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const from = id(formData, "team_id");
  const profileId = id(formData, "profile_id");
  const to = id(formData, "to_team_id");
  if (!from || !profileId) return BAD_INPUT;
  if (!to) return { status: "error", message: "Pick a team to move them to." };
  if (to === from) return { status: "error", message: "They're already on this team." };
  const supabase = await adminSession();
  if (!supabase) return NOT_ADMIN;

  const [{ data: fromTeam }, { data: toTeam }] = await Promise.all([
    supabase.from("teams").select("leader_id").eq("id", from).maybeSingle(),
    supabase.from("teams").select("name").eq("id", to).maybeSingle(),
  ]);
  if (!toTeam) return { status: "error", message: "That team doesn't exist anymore." };
  if (fromTeam?.leader_id === profileId) {
    return { status: "error", message: "They lead this team. Make someone else leader first." };
  }
  if ((await memberCount(supabase, to)) >= TEAM_MAX) {
    return { status: "error", message: `${toTeam.name} is full (${TEAM_MAX} people).` };
  }

  const { data: removed, error: removeError } = await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("team_id", from)
    .eq("profile_id", profileId)
    .eq("status", "member")
    .select("profile_id");
  if (removeError || !removed?.length) return { status: "error", message: "They're not on this team anymore. Reload." };

  const addError = await makeMember(supabase, to, profileId);
  if (addError) {
    await supabase.from("team_members").update({ status: "member" }).eq("team_id", from).eq("profile_id", profileId);
    if (isTeamFull(addError)) return { status: "error", message: `${toTeam.name} is full (${TEAM_MAX} people). Nothing changed.` };
    return { status: "error", message: "We couldn't move them. Nothing changed; try again." };
  }
  return done(from, to);
}

// Add someone who isn't on a team straight to this one, skipping apply and accept.
export async function adminAddMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  const profileId = id(formData, "profile_id");
  if (!teamId) return BAD_INPUT;
  if (!profileId) return { status: "error", message: "Pick someone to add." };
  const supabase = await adminSession();
  if (!supabase) return NOT_ADMIN;

  const { data: current } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("profile_id", profileId)
    .eq("status", "member")
    .maybeSingle();
  if (current) return { status: "error", message: "They're already on a team. Use Move on their team's page." };
  const eligible = await joinableIds([profileId]);
  if (eligible && !eligible.has(profileId)) return { status: "error", message: "They can't join a team." };
  if ((await memberCount(supabase, teamId)) >= TEAM_MAX) {
    return { status: "error", message: `This team is full (${TEAM_MAX} people).` };
  }
  const error = await makeMember(supabase, teamId, profileId);
  if (isTeamFull(error)) return { status: "error", message: `This team is full (${TEAM_MAX} people).` };
  if (error?.code === "23505") return { status: "error", message: "They just joined another team. Reload." };
  if (error) return { status: "error", message: "We couldn't add them. Try again." };
  return done(teamId);
}

// Hand the team to another member (for example when the leader can't make it).
export async function adminMakeLeader(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  const profileId = id(formData, "profile_id");
  if (!teamId || !profileId) return BAD_INPUT;
  const supabase = await adminSession();
  if (!supabase) return NOT_ADMIN;

  const { data: row } = await supabase
    .from("team_members")
    .select("status")
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (row?.status !== "member") return { status: "error", message: "Only a member of the team can lead it." };
  const { error } = await supabase.from("teams").update({ leader_id: profileId }).eq("id", teamId);
  if (error) return { status: "error", message: "We couldn't change the leader. Try again." };
  return done(teamId);
}

export async function adminRemoveMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  const profileId = id(formData, "profile_id");
  if (!teamId || !profileId) return BAD_INPUT;
  const supabase = await adminSession();
  if (!supabase) return NOT_ADMIN;

  const { data: team } = await supabase.from("teams").select("leader_id").eq("id", teamId).maybeSingle();
  if (team?.leader_id === profileId) {
    return { status: "error", message: "They lead this team. Make someone else leader first, or delete the team." };
  }
  const { data, error } = await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .eq("status", "member")
    .select("profile_id");
  if (error || !data?.length) return { status: "error", message: "They're not on this team anymore. Reload." };
  return done(teamId);
}

// Delete the team, its memberships, and invites (cascade). A team with a judging entry
// can't be deleted: judge_entries keeps the reference on purpose.
export async function adminDeleteTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  if (!teamId) return BAD_INPUT;
  const supabase = await adminSession();
  if (!supabase) return NOT_ADMIN;

  const { data, error } = await supabase.from("teams").delete().eq("id", teamId).select("id");
  if (error?.code === "23503") {
    return { status: "error", message: "This team has a submission, so it can't be deleted. Remove the entry in judging first." };
  }
  if (error || !data?.length) return { status: "error", message: "We couldn't delete the team. Try again." };
  revalidatePath("/teams");
  revalidatePath("/teams/people");
  redirect("/teams");
}
