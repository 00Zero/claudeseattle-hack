import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptApplicant, applyToTeam, declineApplicant, leaveTeam, removeMember } from "../actions";
import { ActionButton } from "../_components/action-button";
import { BalanceBadges, Pill } from "../_components/badges";
import { DeadlineBanner } from "../_components/deadline-banner";
import { balanceOf, getViewer, IDEAL_MAX, IDEAL_MIN, TEAM_MAX, TEAM_MIN, type RoleBucket, type Viewer } from "../_lib/teams";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Person = {
  id: string | null; // null on the public page
  name: string;
  subtitle: string | null;
  linkedin: string | null;
  github: string | null;
  role_bucket: RoleBucket | null;
  is_technical: boolean | null;
  is_mentor: boolean;
  is_leader: boolean;
  approved: boolean | null; // null when not shown (public page)
  bio: string | null;
  looking_for: string | null;
};

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

const ROLE_LABEL: Record<RoleBucket, string> = { owner: "Owner", professional: "Professional", student: "Student" };

function titleAtCompany(title: string | null, company: string | null) {
  if (title && company) return `${title} at ${company}`;
  return title || company || null;
}

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  company: string | null;
  linkedin_url: string | null;
  github_username: string | null;
  role_bucket: RoleBucket | null;
  is_technical: boolean | null;
  platform_role: string;
  luma_status: string | null;
  bio: string | null;
  looking_for: string | null;
};

// Logged-in with full access: the tables, with links, approval badges, and every
// membership row so we can show applicants and the viewer's own status (RLS: can_browse).
async function loadFullTeam(id: string, viewerId: string): Promise<Team | null> {
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select(
      "name, concept, looking_for, leader_id, team_members(status, profiles(id, first_name, last_name, job_title, company, linkedin_url, github_username, role_bucket, is_technical, platform_role, luma_status, bio, looking_for))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!team) return null;

  const rows = (team.team_members as unknown as { status: string; profiles: ProfileRow | null }[]).filter(
    (r) => r.profiles,
  );
  const person = (p: ProfileRow): Person => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    subtitle: titleAtCompany(p.job_title, p.company),
    linkedin: p.linkedin_url,
    github: p.github_username ? `https://github.com/${p.github_username}` : null,
    role_bucket: p.role_bucket,
    is_technical: p.is_technical,
    is_mentor: p.platform_role === "mentor",
    is_leader: p.id === team.leader_id,
    approved: p.luma_status === "approved",
    bio: p.bio,
    looking_for: p.looking_for,
  });

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
      <p className={`${box} text-sm`}>
        You lead this team. Accept people who apply below; the team should be {IDEAL_MIN}–{IDEAL_MAX} people.
      </p>
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

function PersonDetails({ person: p, showAbout = false }: { person: Person; showAbout?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{p.name}</span>
        {p.is_leader && <Pill tone="accent">Leader</Pill>}
        {p.is_mentor && <Pill>Mentor</Pill>}
        {p.role_bucket && !p.is_mentor && <Pill>{ROLE_LABEL[p.role_bucket]}</Pill>}
        {p.is_technical && !p.is_mentor && <Pill>Technical</Pill>}
        {p.approved === false && <Pill tone="warn">Not yet approved</Pill>}
      </div>
      {p.subtitle && <p className="text-sm text-fg-muted">{p.subtitle}</p>}
      {showAbout && p.bio && <p className="text-sm">{p.bio}</p>}
      {showAbout && p.looking_for && (
        <p className="text-sm">
          <span className="font-medium">Looking for:</span> <span className="text-fg-muted">{p.looking_for}</span>
        </p>
      )}
      {(p.linkedin || p.github) && (
        <p className="flex gap-4 text-sm">
          {p.linkedin && (
            <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="underline">
              LinkedIn
            </a>
          )}
          {p.github && (
            <a href={p.github} target="_blank" rel="noopener noreferrer" className="underline">
              GitHub
            </a>
          )}
        </p>
      )}
    </div>
  );
}
