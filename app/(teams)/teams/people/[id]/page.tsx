import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inviteToTeam } from "../../actions";
import { ActionButton } from "../../_components/action-button";
import { Pill } from "../../_components/badges";
import { PERSON_COLUMNS, PersonDetails, personFromProfile, type ProfileRow } from "../../_components/person";
import { getViewer, joinableIds, TEAM_MAX } from "../../_lib/teams";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A member's profile for logged-in attendees: what they put on their own profile and their
// team. Never emails (profile_emails isn't read) and never matching-only data (Luma answers,
// survey answers, LinkedIn enrichment; CLAUDE.md, "Luma data: what goes where").
// RLS (profiles_browse plus the test-world rules) decides who can be looked up.
type FullProfile = ProfileRow & { interests: string | null; claude_code_level: string | null };

export default async function PersonPage({ params }: PageProps<"/teams/people/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/login");
  if (viewer.access === "blocked") redirect("/declined");
  if (viewer.access !== "full") redirect("/pending");
  if (!viewer.profile.profile_confirmed) redirect("/profile");

  const supabase = await createClient();
  const [{ data: row }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select(`${PERSON_COLUMNS}, interests, claude_code_level`).eq("id", id).maybeSingle(),
    supabase.from("team_members").select("team_id, teams(name, leader_id)").eq("profile_id", id).eq("status", "member").maybeSingle(),
  ]);
  if (!row) notFound();
  const profile = row as unknown as FullProfile;
  const team = membership?.teams as unknown as { name: string; leader_id: string } | null;
  const person = personFromProfile(profile, team?.leader_id ?? null);
  const isMe = id === viewer.profile.id;

  // Leaders with room can invite someone who isn't on a team (same rules as the people page).
  let invite: { teamId: string; teamName: string; invited: boolean } | null = null;
  if (!isMe && !membership && viewer.myTeamId) {
    const [{ data: myTeam }, { count }, eligible, { data: existing }] = await Promise.all([
      supabase.from("teams").select("name, leader_id").eq("id", viewer.myTeamId).maybeSingle(),
      supabase.from("team_members").select("profile_id", { count: "exact", head: true }).eq("team_id", viewer.myTeamId).eq("status", "member"),
      joinableIds([id]),
      supabase.from("teams_invites").select("status").eq("team_id", viewer.myTeamId).eq("profile_id", id).maybeSingle(),
    ]);
    if (myTeam && myTeam.leader_id === viewer.profile.id && (count ?? 0) < TEAM_MAX && eligible?.has(id)) {
      invite = { teamId: viewer.myTeamId, teamName: myTeam.name, invited: existing?.status === "pending" };
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/teams/people" className="text-sm text-fg-muted underline">
        ← People
      </Link>

      <section className="space-y-3 rounded-lg border border-line bg-bg-raised p-4">
        <PersonDetails person={person} linkName={false} />
        {isMe && (
          <p className="text-sm text-fg-muted">
            This is how logged-in attendees see you.{" "}
            <Link href="/profile" className="underline">
              Edit your profile
            </Link>
          </p>
        )}
      </section>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Team">
          {membership && team ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <Link href={`/teams/${membership.team_id}`} className="underline">
                {team.name}
              </Link>
              {person.is_leader && <Pill tone="accent">Leader</Pill>}
            </span>
          ) : (
            <span className="text-fg-muted">Not on a team yet</span>
          )}
        </Field>
        <Field label="Experience with Claude Code">{profile.claude_code_level || <Empty />}</Field>
        <Field label="Bio" wide>
          {profile.bio || <Empty />}
        </Field>
        <Field label="Interests" wide>
          {profile.interests || <Empty />}
        </Field>
        <Field label="What they're looking for" wide>
          {profile.looking_for || <Empty />}
        </Field>
      </dl>

      {invite &&
        (invite.invited ? (
          <p className="text-sm font-medium">✓ Invited to {invite.teamName}</p>
        ) : (
          <ActionButton
            action={inviteToTeam}
            fields={{ team_id: invite.teamId, profile_id: id }}
            label={`Invite to ${invite.teamName}`}
            pendingLabel="Inviting…"
          />
        ))}
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-sm font-medium text-fg-muted">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}

function Empty() {
  return <span className="text-fg-muted">Not filled in</span>;
}
