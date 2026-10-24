import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getMatchingProfiles } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import { cancelInvite, inviteToTeam } from "../actions";
import { NoteForm } from "../_components/note-form";
import { ActionButton } from "../_components/action-button";
import { DeadlineBanner } from "../_components/deadline-banner";
import { TopPicks, TopPicksLoading } from "../_components/top-picks";
import type { TeamContext } from "../_lib/ai";
import { TeamsTabs } from "../_components/teams-tabs";
import { inboxCount } from "../_lib/inbox";
import { PERSON_COLUMNS, PersonDetails, personFromProfile, type ProfileRow } from "../_components/person";
import { fitFor, type Fit } from "../_lib/fit";
import { balanceOf, getViewer, joinableIds, TEAM_MAX, type RoleBucket } from "../_lib/teams";

const ROLES = [
  ["", "Any role"],
  ["owner", "Business owners and founders"],
  ["professional", "Experienced professionals"],
  ["student", "Students and recent grads"],
  ["mentor", "Mentors"],
] as const;

type Row = ProfileRow & { profile_confirmed: boolean };

// People who can join a team and haven't: participants and mentors with full access (see
// joinableIds) and no 'member' row. Volunteers, judges, and admins aren't listed. RLS:
// profiles_browse. If matching is unavailable, falls back to Luma approval.
async function listUnmatched(viewerId: string) {
  const supabase = await createClient();
  const eligible = await joinableIds();
  if (eligible && eligible.size === 0) return [];
  let peopleQuery = supabase.from("profiles").select(`${PERSON_COLUMNS}, profile_confirmed`);
  peopleQuery = eligible
    ? peopleQuery.in("id", [...eligible])
    : peopleQuery.eq("luma_status", "approved").in("platform_role", ["participant", "mentor"]);
  const [people, members] = await Promise.all([
    peopleQuery,
    supabase.from("team_members").select("profile_id").eq("status", "member"),
  ]);
  if (people.error) throw people.error;
  if (members.error) throw members.error;

  const onTeam = new Set((members.data ?? []).map((m) => m.profile_id));
  const name = (p: Row) => `${p.first_name} ${p.last_name}`.trim();
  return ((people.data ?? []) as Row[])
    .filter((p) => p.id !== viewerId && !onTeam.has(p.id))
    .sort(
      // Confirmed profiles first (they've added a bio and what they're looking for), then by
      // name. People with no name yet (approved without a Luma match) go last.
      (a, b) =>
        Number(b.profile_confirmed) - Number(a.profile_confirmed) ||
        Number(!name(a)) - Number(!name(b)) ||
        name(a).localeCompare(name(b)),
    );
}

// The viewer's team, for "best fit": its words and which balance roles it's missing.
async function loadMyTeam(teamId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name, concept, looking_for, leader_id, team_members(status, profiles(role_bucket, is_technical, platform_role, job_title, company, bio))")
    .eq("id", teamId)
    .maybeSingle();
  if (!data) return null;
  const rows = data.team_members as unknown as {
    status: string;
    profiles: {
      role_bucket: RoleBucket | null;
      is_technical: boolean | null;
      platform_role: string;
      job_title: string | null;
      company: string | null;
      bio: string | null;
    } | null;
  }[];
  const members = rows
    .filter((r) => r.status === "member" && r.profiles)
    .map((r) => ({ ...r.profiles!, is_mentor: r.profiles!.platform_role === "mentor" }));
  return {
    id: data.id as string,
    name: data.name,
    concept: data.concept,
    looking_for: data.looking_for,
    leaderId: data.leader_id as string,
    full: members.length >= TEAM_MAX,
    balance: balanceOf(members),
    members,
  };
}

// Fit per person id, from the matching signals. Only the score and derived reasons leave
// this function. If matching is unavailable, the page falls back to sorting by name.
async function scoreFits(team: NonNullable<Awaited<ReturnType<typeof loadMyTeam>>>, ids: string[]) {
  const fits = new Map<string, Fit>();
  if (!ids.length) return fits;
  try {
    for (const signals of await getMatchingProfiles(ids)) fits.set(signals.profile_id, fitFor(team, signals));
  } catch (error) {
    console.error("Best-fit matching unavailable", error);
  }
  return fits;
}

export default async function PeoplePage({ searchParams }: PageProps<"/teams/people">) {
  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/login");
  if (viewer.access === "blocked") redirect("/declined");
  if (viewer.access !== "full") redirect("/pending");
  // Teams need to know who you are: confirm the Luma-filled profile first (sign-in does this too).
  if (!viewer.profile.profile_confirmed) redirect("/profile");

  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const role = ROLES.some(([value]) => value === pick("role")) ? pick("role") : "";
  const technical = pick("technical") === "yes";
  const here = pick("here") === "yes";
  const query = pick("q").trim().toLowerCase();

  const everyone = await listUnmatched(viewer.profile.id);
  const people = everyone.filter(
    (p) =>
      (role === "" ||
        (role === "mentor" ? p.platform_role === "mentor" : p.platform_role !== "mentor" && p.role_bucket === role)) &&
      (!technical || p.is_technical === true) &&
      (!here || Boolean(p.checked_in_at)) &&
      (!query || `${p.first_name} ${p.last_name}`.toLowerCase().includes(query)),
  );
  const filtered = role !== "" || technical || here || query !== "";
  const checkedIn = everyone.filter((p) => p.checked_in_at).length;

  // "Best fit for <team>" is the default order for people on a team; "name" is the other.
  const myTeam = viewer.myTeamId ? await loadMyTeam(viewer.myTeamId) : null;
  const fits = myTeam && pick("sort") !== "name" ? await scoreFits(myTeam, everyone.map((p) => p.id)) : new Map<string, Fit>();
  const byFit = fits.size > 0;

  // Leaders can invite from here; people they've already invited show as invited.
  const iLead = myTeam?.leaderId === viewer.profile.id;
  const invited = new Set<string>();
  if (iLead) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("teams_invites")
      .select("profile_id")
      .eq("team_id", viewer.myTeamId!)
      .eq("status", "pending");
    for (const row of data ?? []) invited.add(row.profile_id);
  }

  // Claude's top picks: the 15 best by the scoring rule, re-ranked with reasons. Only on the
  // unfiltered fit view of a team with room.
  const shortlist = byFit
    ? [...everyone].sort((a, b) => (fits.get(b.id)?.score ?? 0) - (fits.get(a.id)?.score ?? 0)).slice(0, 15).map((p) => p.id)
    : [];
  const aiTeam: TeamContext | null =
    myTeam && !myTeam.full && byFit && !filtered
      ? {
          id: myTeam.id,
          name: myTeam.name,
          concept: myTeam.concept,
          looking_for: myTeam.looking_for,
          balance: myTeam.balance,
          members: myTeam.members.map((m) => ({
            role: m.is_mentor ? "mentor" : (m.role_bucket ?? "unknown"),
            technical: m.is_technical === true,
            title: [m.job_title, m.company].filter(Boolean).join(" at ") || null,
            bio: m.bio,
          })),
        }
      : null;
  if (byFit) people.sort((a, b) => (fits.get(b.id)?.score ?? 0) - (fits.get(a.id)?.score ?? 0));
  const control = "rounded border border-line-strong bg-bg-raised px-3 py-2";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <DeadlineBanner />
      </div>
      <TeamsTabs active="people" inboxCount={await inboxCount(viewer)} />
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">
          {everyone.length} {everyone.length === 1 ? "person is" : "people are"} still looking. Find someone your team
          needs and say hi, or{" "}
          {viewer.myTeamId ? (
            <Link href={`/teams/${viewer.myTeamId}`} className="underline">
              point them to your team page
            </Link>
          ) : (
            <Link href="/teams" className="underline">
              browse teams
            </Link>
          )}
          .
        </p>
        {checkedIn > 0 && (
          <p className="text-sm">
            <span className="font-medium text-live">{checkedIn} checked in</span>{" "}
            <span className="text-fg-muted">at the venue, per the latest Luma check-in.</span>
          </p>
        )}
      </div>

      {aiTeam && (
        <Suspense fallback={<TopPicksLoading teamName={aiTeam.name} />}>
          <TopPicks team={aiTeam} shortlist={shortlist} canInvite={iLead} invited={invited} />
        </Suspense>
      )}

      <form className="flex flex-wrap gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={pick("q")}
          placeholder="Search by name"
          aria-label="Search by name"
          className={`${control} min-w-0 flex-1 basis-full sm:basis-auto`}
        />
        <select name="role" defaultValue={role} aria-label="Role" className={control}>
          {ROLES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className={`${control} flex items-center gap-2`}>
          <input type="checkbox" name="technical" value="yes" defaultChecked={technical} /> Technical only
        </label>
        {checkedIn > 0 && (
          <label className={`${control} flex items-center gap-2`}>
            <input type="checkbox" name="here" value="yes" defaultChecked={here} /> Checked in only
          </label>
        )}
        {myTeam && (
          <select name="sort" defaultValue={pick("sort") === "name" ? "name" : "fit"} aria-label="Order" className={control}>
            <option value="fit">Best fit for {myTeam.name}</option>
            <option value="name">Name</option>
          </select>
        )}
        <button type="submit" className="btn btn-ghost">
          Filter
        </button>
        {filtered && (
          <Link href="/teams/people" className="self-center text-sm text-fg-muted underline">
            Clear
          </Link>
        )}
      </form>

      {people.length === 0 ? (
        <p className="text-fg-muted">
          {filtered ? "No one matches these filters." : "Everyone who can join a team is on one."}
        </p>
      ) : (
        <>
          {(filtered || byFit) && (
            <p className="text-sm text-fg-muted">
              {filtered ? `Showing ${people.length} of ${everyone.length}` : `${people.length} people`}
              {byFit && `, best fit for ${myTeam!.name} first`}
            </p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {people.map((p) => (
              <li key={p.id} className="space-y-2 rounded-lg border border-line bg-bg-raised p-4">
                <PersonDetails person={personFromProfile(p)} showAbout />
                {byFit && (fits.get(p.id)?.reasons.length ?? 0) > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Why they might fit">
                    {fits.get(p.id)!.reasons.map((reason) => (
                      <li key={reason} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-fg">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
                {iLead && !myTeam!.full && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {invited.has(p.id) ? (
                      <>
                        <span className="text-sm font-medium">✓ Invited to {myTeam!.name}</span>
                        <ActionButton
                          action={cancelInvite}
                          fields={{ team_id: viewer.myTeamId!, profile_id: p.id }}
                          label="Cancel invite"
                          pendingLabel="Cancelling…"
                          variant="link"
                        />
                      </>
                    ) : (
                      <NoteForm
                      action={inviteToTeam}
                        fields={{ team_id: viewer.myTeamId!, profile_id: p.id }}
                        label={`Invite to ${myTeam!.name}`}
                        pendingLabel="Inviting…"
                        variant="ghost"
                      submitLabel="Send invite"
                      placeholder="Why do you want them on your team?"
                      collapsed
                    />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
