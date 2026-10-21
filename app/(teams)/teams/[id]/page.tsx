import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptApplicant, applyToTeam, declineApplicant, leaveTeam, removeMember } from "../actions";
import { ActionButton } from "../_components/action-button";
import { BalanceBadges } from "../_components/badges";
import { DeadlineBanner } from "../_components/deadline-banner";
import { PERSON_COLUMNS, PersonDetails, personFromProfile, titleAtCompany, type Person, type ProfileRow } from "../_components/person";
import { balanceOf, getViewer, IDEAL_MAX, IDEAL_MIN, TEAM_MAX, TEAM_MIN, type Viewer } from "../_lib/teams";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Applicant = Person & { onOtherTeam: boolean };

type Team = {
  name: string;
  concept: string | null;
  looking_for: string | null;
  members: Person[];
  applicants: Applicant[];
  myStatus: string | null; // the viewer's own row on this team, if any
  iLead: boolean;
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

  return {
    name: team.name,
    concept: team.concept,
    looking_for: team.looking_for,
    members: rows.filter((r) => r.status === "member").map((r) => person(r.profiles!)),
    applicants: applied.map((p) => ({ ...person(p), onOtherTeam: elsewhere.has(p.id) })),
    myStatus: rows.find((r) => r.profiles!.id === viewerId)?.status ?? null,
    iLead: team.leader_id === viewerId,
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
      bio: null,
      looking_for: null,
    })),
    applicants: [],
    myStatus: null,
    iLead: false,
  };
}

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const viewer = await getViewer();
  if (viewer.signedIn && viewer.access === "blocked") redirect("/declined");
  if (viewer.signedIn && viewer.access !== "full") redirect("/pending");

  const team = viewer.signedIn ? await loadFullTeam(id, viewer.profile.id) : await loadPublicTeam(id);
  if (!team) notFound();

  const members = [...team.members].sort((a, b) => Number(b.is_leader) - Number(a.is_leader) || a.name.localeCompare(b.name));
  const size = members.length;
  const fields = { team_id: id };

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

      <ViewerPanel viewer={viewer} team={team} teamId={id} full={size >= TEAM_MAX} />

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
        <ul className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
          {members.map((m, i) => (
            <li key={m.id ?? i} className="space-y-2 px-4 py-3">
              <PersonDetails person={m} />
              {team.iLead && !m.is_leader && m.id && (
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
    </div>
  );
}

// What the viewer can do here: apply, withdraw, leave, or why they can't.
function ViewerPanel({ viewer, team, teamId, full }: { viewer: Viewer; team: Team; teamId: string; full: boolean }) {
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
        <Link href={`/teams/${teamId}/edit`} className="text-sm text-fg-muted underline">
          Edit name, concept, or who you&apos;re looking for
        </Link>
      </div>
    );
  }

  switch (team.myStatus) {
    case "member":
      return (
        <div className={box}>
          <p className="text-sm">You&apos;re on this team.</p>
          <ActionButton
            action={leaveTeam}
            fields={fields}
            label="Leave team"
            pendingLabel="Leaving…"
            confirm={`Leave ${team.name}? You'd need to apply again to rejoin.`}
            variant="link"
          />
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
      return <p className={`${box} text-sm`}>You left this team. You can apply to another team.</p>;
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
  if (full) return <p className={`${box} text-sm text-fg-muted`}>This team is full ({TEAM_MAX} people).</p>;

  return (
    <div className="space-y-1">
      <ActionButton action={applyToTeam} fields={fields} label="Apply to join" pendingLabel="Applying…" />
      <p className="text-sm text-fg-muted">The leader sees your profile and accepts or declines.</p>
    </div>
  );
}
