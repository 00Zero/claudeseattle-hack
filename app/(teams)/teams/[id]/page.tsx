import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  acceptApplicant,
  acceptInvite,
  applyToTeam,
  cancelInvite,
  declineApplicant,
  declineInvite,
  leaveTeam,
  removeMember,
} from "../actions";
import { ActionButton } from "../_components/action-button";
import { NoteForm } from "../_components/note-form";
import { NoteQuote } from "../_components/note-quote";
import { AdminPanel } from "../_components/admin-panel";
import { ApplicantFitLine, ApplicantFitLoading, applicantFits } from "../_components/applicant-fit";
import { BalanceBadges } from "../_components/badges";
import { DeadlineBanner } from "../_components/deadline-banner";
import { SharePanel } from "../_components/share-panel";
import { WhyYouFit, WhyYouFitLoading } from "../_components/why-you-fit";
import { PERSON_COLUMNS, PersonDetails, personFromProfile, titleAtCompany, type Person, type ProfileRow } from "../_components/person";
import { balanceOf, getViewer, IDEAL_MAX, IDEAL_MIN, MAX_APPLICATIONS, TEAM_MAX, TEAM_MIN, type Viewer } from "../_lib/teams";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Applicant = Person & { onOtherTeam: boolean; note: string | null };

type Team = {
  name: string;
  concept: string | null;
  looking_for: string | null;
  members: Person[];
  applicants: Applicant[];
  myStatus: string | null; // the viewer's own row on this team, if any
  iLead: boolean;
  invited: Person[]; // open invites, for the leader
  invitedMe: boolean; // the viewer has an open invite to this team
  invitedMeNote: string | null; // the leader's note on that invite
};

// Logged-in with full access: the tables, with links, approval badges, and every
// membership row so we can show applicants and the viewer's own status (RLS: can_browse).
async function loadFullTeam(id: string, viewerId: string): Promise<Team | null> {
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select(
      `name, concept, looking_for, leader_id, team_members(status, profiles(${PERSON_COLUMNS}))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!team) return null;

  const rows = (team.team_members as unknown as { status: string; profiles: ProfileRow | null }[]).filter(
    (r) => r.profiles,
  );
  const person = (p: ProfileRow) => personFromProfile(p, team.leader_id);

  // Applicants who have since joined another team can only be declined.
  const applied = rows.filter((r) => r.status === "applied").map((r) => r.profiles!);
  const elsewhere = new Set<string>();
  if (applied.length) {
    const { data } = await supabase
      .from("team_members")
      .select("profile_id")
      .in("profile_id", applied.map((p) => p.id))
      .eq("status", "member")
      .neq("team_id", id);
    for (const row of data ?? []) elsewhere.add(row.profile_id);
  }

  // Open invites: the leader sees all of them, an invitee only their own (RLS: teams_invites_read).
  const { data: inviteRows } = await supabase
    .from("teams_invites")
    .select("profile_id, note")
    .eq("team_id", id)
    .eq("status", "pending");
  const inviteIds = (inviteRows ?? []).map((r) => r.profile_id as string);
  const iLead = team.leader_id === viewerId;
  // Applicants' notes: only the leader can read them (RLS: teams_application_notes_read).
  const notes = new Map<string, string>();
  if (iLead && applied.length) {
    const { data } = await supabase.from("teams_application_notes").select("profile_id, note").eq("team_id", id);
    for (const row of data ?? []) notes.set(row.profile_id as string, row.note as string);
  }
  let invited: Person[] = [];
  if (iLead && inviteIds.length) {
    const { data } = await supabase.from("profiles").select(PERSON_COLUMNS).in("id", inviteIds);
    invited = ((data ?? []) as unknown as ProfileRow[]).map(person);
  }

  return {
    name: team.name,
    concept: team.concept,
    looking_for: team.looking_for,
    members: rows.filter((r) => r.status === "member").map((r) => person(r.profiles!)),
    applicants: applied.map((p) => ({ ...person(p), onOtherTeam: elsewhere.has(p.id), note: notes.get(p.id) ?? null })),
    myStatus: rows.find((r) => r.profiles!.id === viewerId)?.status ?? null,
    iLead,
    invited,
    invitedMe: inviteIds.includes(viewerId),
    invitedMeNote: ((inviteRows ?? []).find((r) => r.profile_id === viewerId)?.note as string | null) ?? null,
  };
}

// Signed out: the anonymous-safe views. "First L." unless the member opted in; no links.
async function loadPublicTeam(id: string): Promise<Team | null> {
  const supabase = await createClient();
  const [{ data: team }, { data: members }] = await Promise.all([
    supabase.from("public_teams").select("name, concept").eq("id", id).maybeSingle(),
    supabase
      .from("public_team_members")
      .select("display_name, full_name, job_title, company, role_bucket, is_technical, is_mentor, is_leader")
      .eq("team_id", id),
  ]);
  if (!team) return null;

  return {
    name: team.name,
    concept: team.concept,
    looking_for: null,
    members: (members ?? []).map((m) => ({
      id: null,
      name: m.full_name ?? m.display_name,
      subtitle: titleAtCompany(m.job_title, m.company),
      linkedin: null,
      github: null,
      role_bucket: m.role_bucket,
      is_technical: m.is_technical,
      is_mentor: m.is_mentor,
      is_leader: m.is_leader,
      approved: null,
      checked_in: false, // not in the public view
      bio: null,
      looking_for: null,
    })),
    applicants: [],
    myStatus: null,
    iLead: false,
    invited: [],
    invitedMe: false,
    invitedMeNote: null,
  };
}

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const viewer = await getViewer();
  if (viewer.signedIn && viewer.access === "blocked") redirect("/declined");
  if (viewer.signedIn && viewer.access !== "full") redirect("/pending");
  // Teams need to know who you are: confirm the Luma-filled profile first (sign-in does this too).
  if (viewer.signedIn && !viewer.profile.profile_confirmed) redirect("/profile");

  const team = viewer.signedIn ? await loadFullTeam(id, viewer.profile.id) : await loadPublicTeam(id);
  if (!team) notFound();

  const members = [...team.members].sort((a, b) => Number(b.is_leader) - Number(a.is_leader) || a.name.localeCompare(b.name));
  const size = members.length;
  const fields = { team_id: id };
  // Leaders get an AI read on each applicant; one call for all of them, streamed per card.
  const fits = team.iLead && team.applicants.length ? applicantFits(id, team.applicants.map((a) => a.id!)) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/teams" className="text-sm text-fg-muted underline">
          ← All teams
        </Link>
        <h1 className="text-2xl font-semibold">{team.name}</h1>
        <DeadlineBanner />
      </div>

      {team.concept && <p className="whitespace-pre-line">{team.concept}</p>}
      {team.looking_for && (
        <p>
          <span className="font-medium">Looking for:</span> <span className="text-fg-muted">{team.looking_for}</span>
        </p>
      )}

      <ViewerPanel viewer={viewer} team={team} teamId={id} size={size} />

      {viewer.signedIn && !viewer.joinBlockedReason && !viewer.myTeamId && !team.iLead && size < TEAM_MAX && (
        <Suspense fallback={<WhyYouFitLoading />}>
          <WhyYouFit
            viewerId={viewer.profile.id}
            team={{
              id,
              name: team.name,
              concept: team.concept,
              looking_for: team.looking_for,
              balance: balanceOf(members),
              members: members.map((m) => ({
                role: m.is_mentor ? "mentor" : (m.role_bucket ?? "unknown"),
                technical: m.is_technical === true,
                title: m.subtitle,
                bio: m.bio,
              })),
            }}
          />
        </Suspense>
      )}

      {(team.iLead || team.myStatus === "member") && <SharePanel teamId={id} teamName={team.name} />}

      {team.iLead && team.applicants.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Applicants <span className="font-normal text-fg-muted">({team.applicants.length})</span>
          </h2>
          {size >= TEAM_MAX && (
            <p className="text-sm text-fg-muted">Your team is full. Remove someone before accepting another person.</p>
          )}
          <ul className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
            {team.applicants.map((a) => (
              <li key={a.id} className="space-y-2 px-4 py-3">
                <PersonDetails person={a} showAbout />
                {a.note && <NoteQuote from={a.name} note={a.note} />}
                {fits && (
                  <Suspense fallback={<ApplicantFitLoading />}>
                    <ApplicantFitLine fits={fits} profileId={a.id!} />
                  </Suspense>
                )}
                {a.onOtherTeam ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-fg-muted">They&apos;ve joined another team.</span>
                    <ActionButton action={declineApplicant} fields={{ ...fields, profile_id: a.id! }} label="Dismiss" variant="link" />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    <ActionButton action={acceptApplicant} fields={{ ...fields, profile_id: a.id! }} label="Accept" pendingLabel="Accepting…" />
                    <ActionButton action={declineApplicant} fields={{ ...fields, profile_id: a.id! }} label="Decline" pendingLabel="Declining…" variant="ghost" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {team.iLead && team.invited.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Invited <span className="font-normal text-fg-muted">({team.invited.length})</span>
          </h2>
          <p className="text-sm text-fg-muted">They see the invite on this page and on Teams, and can accept or decline.</p>
          <ul className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
            {team.invited.map((p) => (
              <li key={p.id} className="space-y-2 px-4 py-3">
                <PersonDetails person={p} />
                <ActionButton
                  action={cancelInvite}
                  fields={{ team_id: id, profile_id: p.id! }}
                  label="Cancel invite"
                  pendingLabel="Cancelling…"
                  variant="link"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Members <span className="font-normal text-fg-muted">({size})</span>
          </h2>
          {size < TEAM_MIN ? (
            <span className="text-sm text-fg-muted">A team needs at least {TEAM_MIN} people.</span>
          ) : (
            (size < IDEAL_MIN || size > IDEAL_MAX) && (
              <span className="text-sm text-fg-muted">
                Teams should be {IDEAL_MIN}–{IDEAL_MAX}.
              </span>
            )
          )}
        </div>
        <BalanceBadges balance={balanceOf(members)} />
        {team.iLead && size === TEAM_MIN && (
          <p className="text-sm text-fg-muted">
            With {TEAM_MIN} people you can&apos;t remove anyone; accept someone first, or ask an organizer.
          </p>
        )}
        <ul className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
          {members.map((m, i) => (
            <li key={m.id ?? i} className="space-y-2 px-4 py-3">
              <PersonDetails person={m} />
              {team.iLead && !m.is_leader && m.id && size > TEAM_MIN && (
                <ActionButton
                  action={removeMember}
                  fields={{ ...fields, profile_id: m.id }}
                  label="Remove from team"
                  pendingLabel="Removing…"
                  confirm={`Remove ${m.name} from ${team.name}? They can then join another team.`}
                  variant="link"
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {viewer.signedIn && viewer.profile.platform_role === "admin" && (
        <AdminPanel teamId={id} teamName={team.name} members={members} />
      )}
    </div>
  );
}

// What the viewer can do here: apply, withdraw, leave, or why they can't.
function ViewerPanel({ viewer, team, teamId, size }: { viewer: Viewer; team: Team; teamId: string; size: number }) {
  const full = size >= TEAM_MAX;
  const fields = { team_id: teamId };
  const box = "space-y-2 rounded-lg border border-line px-4 py-3";

  if (!viewer.signedIn) {
    return (
      <p className="text-sm">
        <Link href="/login" className="underline">
          Log in
        </Link>{" "}
        to apply to this team.
      </p>
    );
  }
  if (team.iLead) {
    return (
      <div className={box}>
        <p className="text-sm">
          You lead this team. Accept people who apply below; the team should be {IDEAL_MIN}–{IDEAL_MAX} people.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/teams/people" className="btn btn-ghost">
            Find people for your team
          </Link>
          <Link href={`/teams/${teamId}/edit`} className="text-sm text-fg-muted underline">
            Edit name, concept, or who you&apos;re looking for
          </Link>
        </div>
      </div>
    );
  }

  if (team.myStatus !== "member" && team.invitedMe) {
    return (
      <div className={`${box} border-accent`}>
        <p className="text-sm">
          <strong>You&apos;re invited to join {team.name}.</strong>{" "}
          {viewer.myTeamId ? "You're on another team, so leave it first to accept." : "Accept to join the team."}
        </p>
        {team.invitedMeNote && <NoteQuote from="the team leader" note={team.invitedMeNote} />}
        <div className="flex flex-wrap items-start gap-2">
          {!viewer.myTeamId && (
            <ActionButton action={acceptInvite} fields={fields} label="Accept invite" pendingLabel="Joining…" />
          )}
          <ActionButton action={declineInvite} fields={fields} label="Decline" pendingLabel="Declining…" variant="ghost" />
        </div>
      </div>
    );
  }

  switch (team.myStatus) {
    case "member":
      return (
        <div className={box}>
          <p className="text-sm">You&apos;re on this team.</p>
          {size <= TEAM_MIN ? (
            <p className="text-sm text-fg-muted">
              A team needs at least {TEAM_MIN} people, so you can&apos;t leave right now. Ask an organizer if you need to.
            </p>
          ) : (
            <ActionButton
              action={leaveTeam}
              fields={fields}
              label="Leave team"
              pendingLabel="Leaving…"
              confirm={`Leave ${team.name}? You'd need to apply again to rejoin.`}
              variant="link"
            />
          )}
        </div>
      );
    case "applied":
      return (
        <div className={box}>
          <p className="text-sm">
            <strong>Application sent.</strong> The team leader will accept or decline it.
          </p>
          <ActionButton action={leaveTeam} fields={fields} label="Withdraw application" pendingLabel="Withdrawing…" variant="link" />
        </div>
      );
    case "rejected":
      return <p className={`${box} text-sm`}>The leader declined your application. You can apply to another team.</p>;
    case "removed":
      return <p className={`${box} text-sm`}>You were removed from this team. You can apply to another team.</p>;
    case "left":
      // Applications are withdrawn automatically when you join another team (shared_expire_on_join).
      return (
        <p className={`${box} text-sm`}>
          {viewer.myTeamId && viewer.myTeamId !== teamId
            ? "Your application here was withdrawn when you joined another team."
            : "You left this team. You can apply to another team."}
        </p>
      );
  }

  if (viewer.joinBlockedReason) return <p className={`${box} text-sm text-fg-muted`}>{viewer.joinBlockedReason}</p>;
  if (viewer.myTeamId) {
    return (
      <p className={`${box} text-sm`}>
        You&apos;re already on{" "}
        <Link href={`/teams/${viewer.myTeamId}`} className="underline">
          another team
        </Link>
        . Leave it to apply here.
      </p>
    );
  }
  if (full) return <p className={`${box} text-sm text-fg-muted`}>This team is full ({size} people).</p>;
  if (viewer.openApplications >= MAX_APPLICATIONS) {
    return (
      <p className={`${box} text-sm`}>
        You&apos;ve applied to {MAX_APPLICATIONS} teams, the most at once.{" "}
        <Link href="/teams/inbox" className="underline">
          Withdraw one in your Inbox
        </Link>{" "}
        to apply here.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <NoteForm
        action={applyToTeam}
        fields={fields}
        label="Apply to join"
        pendingLabel="Applying…"
        placeholder="Why do you want to join this team? What would you bring?"
      />
      <p className="text-sm text-fg-muted">
        The leader sees your profile and accepts or declines. You can apply to {MAX_APPLICATIONS} teams at a time
        {viewer.openApplications ? ` (you've applied to ${viewer.openApplications})` : ""}.
      </p>
    </div>
  );
}
