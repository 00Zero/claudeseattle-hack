import Link from "next/link";
import { redirect } from "next/navigation";
import { getMatchingProfiles } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import { DeadlineBanner } from "../_components/deadline-banner";
import { TeamsTabs } from "../_components/teams-tabs";
import { PERSON_COLUMNS, PersonDetails, personFromProfile, type ProfileRow } from "../_components/person";
import { fitFor, type Fit } from "../_lib/fit";
import { balanceOf, getViewer, type RoleBucket } from "../_lib/teams";

const ROLES = [
  ["", "Any role"],
  ["owner", "Small business owners"],
  ["professional", "Professionals"],
  ["student", "Students"],
  ["mentor", "Mentors"],
] as const;

type Row = ProfileRow & { profile_confirmed: boolean };

// People who can join a team and haven't: approved participants and mentors with no
// 'member' row. Volunteers, judges, and admins aren't listed. RLS: profiles_browse.
async function listUnmatched(viewerId: string) {
  const supabase = await createClient();
  const [people, members] = await Promise.all([
    supabase
      .from("profiles")
      .select(`${PERSON_COLUMNS}, profile_confirmed`)
      .eq("luma_status", "approved")
      .in("platform_role", ["participant", "mentor"]),
    supabase.from("team_members").select("profile_id").eq("status", "member"),
  ]);
  if (people.error) throw people.error;
  if (members.error) throw members.error;

  const onTeam = new Set((members.data ?? []).map((m) => m.profile_id));
  return ((people.data ?? []) as Row[])
    .filter((p) => p.id !== viewerId && !onTeam.has(p.id))
    .sort(
      // Confirmed profiles first (they've added a bio and what they're looking for), then by name.
      (a, b) =>
        Number(b.profile_confirmed) - Number(a.profile_confirmed) ||
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    );
}

// The viewer's team, for "best fit": its words and which balance roles it's missing.
async function loadMyTeam(teamId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("name, concept, looking_for, team_members(status, profiles(role_bucket, is_technical, platform_role))")
    .eq("id", teamId)
    .maybeSingle();
  if (!data) return null;
  const rows = data.team_members as unknown as {
    status: string;
    profiles: { role_bucket: RoleBucket | null; is_technical: boolean | null; platform_role: string } | null;
  }[];
  const members = rows
    .filter((r) => r.status === "member" && r.profiles)
    .map((r) => ({ ...r.profiles!, is_mentor: r.profiles!.platform_role === "mentor" }));
  return { name: data.name, concept: data.concept, looking_for: data.looking_for, balance: balanceOf(members) };
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

  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const role = ROLES.some(([value]) => value === pick("role")) ? pick("role") : "";
  const technical = pick("technical") === "yes";
  const query = pick("q").trim().toLowerCase();

  const everyone = await listUnmatched(viewer.profile.id);
  const people = everyone.filter(
    (p) =>
      (role === "" ||
        (role === "mentor" ? p.platform_role === "mentor" : p.platform_role !== "mentor" && p.role_bucket === role)) &&
      (!technical || p.is_technical === true) &&
      (!query || `${p.first_name} ${p.last_name}`.toLowerCase().includes(query)),
  );
  const filtered = role !== "" || technical || query !== "";

  // "Best fit for <team>" is the default order for people on a team; "name" is the other.
  const myTeam = viewer.myTeamId ? await loadMyTeam(viewer.myTeamId) : null;
  const fits = myTeam && pick("sort") !== "name" ? await scoreFits(myTeam, people.map((p) => p.id)) : new Map<string, Fit>();
  const byFit = fits.size > 0;
  if (byFit) people.sort((a, b) => (fits.get(b.id)?.score ?? 0) - (fits.get(a.id)?.score ?? 0));
  const control = "rounded border border-line-strong bg-bg-raised px-3 py-2";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <DeadlineBanner />
      </div>
      <TeamsTabs active="people" />
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
      </div>

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
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
