"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cleanNote } from "./_lib/notes";
import { getViewer, isTeamFull, isTooManyApplications, joinableIds, MAX_APPLICATIONS, TEAM_MAX, TEAM_MIN } from "./_lib/teams";

export type FormState = { status: "idle" | "ok" | "error"; message?: string };

function text(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Creates a team led by the current user. RLS (teams_create) requires can_join_teams() and
// leader_id = auth.uid(); a trigger then adds the leader as a member, which fails if they're
// already on another team (one_team_per_person).
export async function createTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };
  if (viewer.joinBlockedReason) return { status: "error", message: viewer.joinBlockedReason };
  if (viewer.myTeamId) return { status: "error", message: "You're already on a team. Leave it first to start a new one." };

  const name = text(formData, "name", 60);
  if (name.length < 2) return { status: "error", message: "Give your team a name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .insert({
      name,
      concept: text(formData, "concept", 1000) || null,
      looking_for: text(formData, "looking_for", 300) || null,
      leader_id: viewer.profile.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && error.message.includes("one_team_per_person")) {
      return { status: "error", message: "You're already on a team. Leave it first to start a new one." };
    }
    if (error.code === "23505") return { status: "error", message: "A team with that name already exists. Pick another." };
    return { status: "error", message: "We couldn't create your team. Try again." };
  }

  revalidatePath("/teams");
  redirect(`/teams/${data.id}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && UUID.test(value) ? value : null;
}

async function memberCount(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string) {
  const { count } = await supabase
    .from("team_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("status", "member");
  return count ?? 0;
}

function done(teamId: string): FormState {
  revalidatePath("/teams");
  revalidatePath("/teams/inbox");
  revalidatePath(`/teams/${teamId}`);
  return { status: "ok" };
}

const TOO_MANY = `You can apply to ${MAX_APPLICATIONS} teams at a time. Withdraw one in your Inbox to apply here.`;

// Apply: insert your own row as 'applied' (RLS: members_apply needs can_join_teams()).
// One application per team, ever (the row's primary key), so someone who left or was
// declined can't re-apply to the same team; they can apply elsewhere.
export async function applyToTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  if (!teamId) return { status: "error", message: "That team doesn't exist." };
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };
  if (viewer.joinBlockedReason) return { status: "error", message: viewer.joinBlockedReason };
  if (viewer.myTeamId) return { status: "error", message: "You're already on a team. Leave it first to apply here." };
  if (viewer.openApplications >= MAX_APPLICATIONS) return { status: "error", message: TOO_MANY };
  let note: string | null;
  try {
    note = cleanNote(formData.get("note"));
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const supabase = await createClient();
  if ((await memberCount(supabase, teamId)) >= TEAM_MAX) {
    return { status: "error", message: `This team is full (${TEAM_MAX} people).` };
  }
  const { error } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, profile_id: viewer.profile.id, status: "applied" });
  if (isTooManyApplications(error)) return { status: "error", message: TOO_MANY };
  if (error?.code === "23505") return { status: "error", message: "You've already applied to this team." };
  if (error) return { status: "error", message: "We couldn't send your application. Try again." };
  // Only the applicant and this team's leader can read it (teams_application_notes).
  if (note) {
    const { error: noteError } = await supabase
      .from("teams_application_notes")
      .insert({ team_id: teamId, profile_id: viewer.profile.id, note });
    if (noteError) console.error("Teams: couldn't save application note", noteError.code);
  }
  return done(teamId);
}

// Withdraw an application or leave the team: set your own row to 'left' (RLS: members_leave).
// The leader can't leave, because the team would have no one to accept applicants.
export async function leaveTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  if (!teamId) return { status: "error", message: "That team doesn't exist." };
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };

  const supabase = await createClient();
  const { data: team } = await supabase.from("teams").select("leader_id").eq("id", teamId).maybeSingle();
  if (team?.leader_id === viewer.profile.id) {
    return { status: "error", message: "Leaders can't leave their team. Ask an organizer to hand it over." };
  }
  // Members (not applicants) can't take the team below 2.
  const { data: mine } = await supabase
    .from("team_members")
    .select("status")
    .eq("team_id", teamId)
    .eq("profile_id", viewer.profile.id)
    .maybeSingle();
  if (mine?.status === "member" && (await memberCount(supabase, teamId)) <= TEAM_MIN) {
    return { status: "error", message: `A team needs at least ${TEAM_MIN} people, so you can't leave right now. Ask an organizer.` };
  }
  const { data, error } = await supabase
    .from("team_members")
    .update({ status: "left" })
    .eq("team_id", teamId)
    .eq("profile_id", viewer.profile.id)
    .in("status", ["applied", "member"])
    .select("profile_id");
  if (error || !data?.length) return { status: "error", message: "We couldn't update your membership. Try again." };
  return done(teamId);
}

// Leader actions on someone else's row (RLS: members_leader). Only status and joined_at
// are updatable. An empty result means the row wasn't in the expected state, or the
// viewer isn't the leader.
async function leaderUpdate(
  formData: FormData,
  from: "applied" | "member",
  to: "member" | "rejected" | "removed",
): Promise<FormState> {
  const teamId = id(formData, "team_id");
  const profileId = id(formData, "profile_id");
  if (!teamId || !profileId) return { status: "error", message: "Something went wrong. Reload and try again." };
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };
  if (profileId === viewer.profile.id) return { status: "error", message: "You can't do that to yourself." };

  const supabase = await createClient();
  if (to === "removed" && (await memberCount(supabase, teamId)) <= TEAM_MIN) {
    return { status: "error", message: `A team needs at least ${TEAM_MIN} people. Add someone first, or ask an organizer.` };
  }
  if (to === "member" && (await memberCount(supabase, teamId)) >= TEAM_MAX) {
    return { status: "error", message: `Your team is full (${TEAM_MAX} people). Remove someone first.` };
  }
  const { data, error } = await supabase
    .from("team_members")
    .update(to === "member" ? { status: to, joined_at: new Date().toISOString() } : { status: to })
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .eq("status", from)
    .select("profile_id");
  if (isTeamFull(error)) return { status: "error", message: `Your team is full (${TEAM_MAX} people). Remove someone first.` };
  if (error?.code === "23505") return { status: "error", message: "They've already joined another team." };
  if (error || !data?.length) return { status: "error", message: "That didn't work. Reload the page and try again." };
  return done(teamId);
}

export async function acceptApplicant(_prev: FormState, formData: FormData) {
  return leaderUpdate(formData, "applied", "member");
}

export async function declineApplicant(_prev: FormState, formData: FormData) {
  return leaderUpdate(formData, "applied", "rejected");
}

export async function removeMember(_prev: FormState, formData: FormData) {
  return leaderUpdate(formData, "member", "removed");
}

// Leader edits the team's name, concept, and looking-for (RLS: teams_leader). Allowed after
// the deadline; the pages show that it's past the deadline.
export async function updateTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  if (!teamId) return { status: "error", message: "That team doesn't exist." };
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };

  const name = text(formData, "name", 60);
  if (name.length < 2) return { status: "error", message: "Give your team a name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .update({
      name,
      concept: text(formData, "concept", 1000) || null,
      looking_for: text(formData, "looking_for", 300) || null,
    })
    .eq("id", teamId)
    .eq("leader_id", viewer.profile.id)
    .select("id");
  if (error?.code === "23505") return { status: "error", message: "A team with that name already exists. Pick another." };
  if (error) return { status: "error", message: "We couldn't save your changes. Try again." };
  if (!data?.length) return { status: "error", message: "Only the team leader can edit the team." };

  revalidatePath("/teams");
  redirect(`/teams/${teamId}`);
}

// Leader invites someone who can join and isn't on a team (RLS: teams_invites_create /
// teams_invites_leader_update). Re-inviting after a decline or cancel reopens the same row.
export async function inviteToTeam(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  const profileId = id(formData, "profile_id");
  if (!teamId || !profileId) return { status: "error", message: "Something went wrong. Reload and try again." };
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };

  const supabase = await createClient();
  const [{ data: team }, { data: person }, { data: theirTeam }, { data: existing }] = await Promise.all([
    supabase.from("teams").select("leader_id").eq("id", teamId).maybeSingle(),
    supabase.from("profiles").select("first_name, luma_status, platform_role").eq("id", profileId).maybeSingle(),
    supabase.from("team_members").select("team_id").eq("profile_id", profileId).eq("status", "member").maybeSingle(),
    supabase.from("teams_invites").select("status").eq("team_id", teamId).eq("profile_id", profileId).maybeSingle(),
  ]);
  if (team?.leader_id !== viewer.profile.id) return { status: "error", message: "Only the team leader can invite people." };
  const eligible = await joinableIds([profileId]);
  const canJoin = eligible
    ? eligible.has(profileId)
    : person?.luma_status === "approved" && ["participant", "mentor"].includes(person.platform_role);
  if (!person || !canJoin) return { status: "error", message: "They can't join a team." };
  if (theirTeam) return { status: "error", message: `${person.first_name} is already on a team.` };
  if ((await memberCount(supabase, teamId)) >= TEAM_MAX) {
    return { status: "error", message: `Your team is full (${TEAM_MAX} people).` };
  }
  if (existing?.status === "pending") return { status: "error", message: `${person.first_name} is already invited.` };
  let note: string | null;
  try {
    note = cleanNote(formData.get("note"));
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }

  const { error } = existing
    ? await supabase
        .from("teams_invites")
        .update({ status: "pending", responded_at: null, note })
        .eq("team_id", teamId)
        .eq("profile_id", profileId)
    : await supabase.from("teams_invites").insert({ team_id: teamId, profile_id: profileId, invited_by: viewer.profile.id, note });
  if (error) return { status: "error", message: "We couldn't send the invite. Try again." };
  revalidatePath("/teams/people");
  return done(teamId);
}

export async function cancelInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  const profileId = id(formData, "profile_id");
  if (!teamId || !profileId) return { status: "error", message: "Something went wrong. Reload and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams_invites")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .select("profile_id");
  if (error || !data?.length) return { status: "error", message: "That didn't work. Reload the page and try again." };
  revalidatePath("/teams/people");
  return done(teamId);
}

const ACCEPT_ERRORS: Record<string, string> = {
  not_signed_in: "Your session expired. Log in again.",
  not_allowed: "You can't join a team.",
  no_invite: "This invite isn't open anymore.",
  already_on_team: "You're already on a team. Leave it first to accept.",
  team_full: `This team is full (${TEAM_MAX} people).`,
};

// Invitee accepts: accept_team_invite() checks everything and adds them as a member.
export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  if (!teamId) return { status: "error", message: "That team doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_team_invite", { p_team: teamId });
  if (isTeamFull(error)) return { status: "error", message: ACCEPT_ERRORS.team_full };
  if (error) return { status: "error", message: "We couldn't accept the invite. Try again." };
  if (data !== "ok") return { status: "error", message: ACCEPT_ERRORS[data as string] ?? "We couldn't accept the invite." };
  revalidatePath("/teams/people");
  return done(teamId);
}

export async function declineInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const teamId = id(formData, "team_id");
  if (!teamId) return { status: "error", message: "That team doesn't exist." };
  const viewer = await getViewer();
  if (!viewer.signedIn) return { status: "error", message: "Your session expired. Log in again." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams_invites")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("profile_id", viewer.profile.id)
    .eq("status", "pending")
    .select("profile_id");
  if (error || !data?.length) return { status: "error", message: "That didn't work. Reload the page and try again." };
  return done(teamId);
}
