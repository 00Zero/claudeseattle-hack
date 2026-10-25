import Link from "next/link";
import { redirect } from "next/navigation";
import { BalanceBadges, Pill } from "./_components/badges";
import { DeadlineBanner } from "./_components/deadline-banner";
import { TeamsTabs } from "./_components/teams-tabs";
import { inboxCount } from "./_lib/inbox";
import { getMatchingProfiles } from "@/lib/matching";
import { fitForViewer, type Fit } from "./_lib/fit";
import { getViewer, listTeams, sortTeams, TEAM_MAX, type Balance, type TeamSummary } from "./_lib/teams";

const NEEDS: [keyof Balance | "", string][] = [
  ["", "Any"],
  ["owner", "A business owner or founder"],
  ["professional", "An experienced professional"],
  ["student", "A student or recent grad"],
  ["technical", "Someone technical"],
];

export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  const viewer = await getViewer();
  if (viewer.signedIn && viewer.access === "blocked") redirect("/declined");
  if (viewer.signedIn && viewer.access !== "full") redirect("/pending");
  // Teams need to know who you are: confirm the Luma-filled profile first (sign-in does this too).
  if (viewer.signedIn && !viewer.profile.profile_confirmed) redirect("/profile");

  // Filters live in the URL so a filtered view can be shared or bookmarked.
  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const query = pick("q").trim();
  const needs = NEEDS.some(([value]) => value === pick("needs")) ? (pick("needs") as keyof Balance | "") : "";
  const myTeamId = viewer.signedIn ? viewer.myTeamId : null;
  // People who could join a team right now get "teams I can join" and "best fit for me".
  const canJoin = viewer.signedIn && !viewer.joinBlockedReason && !myTeamId;
  const onlyJoinable = canJoin && pick("open") === "1";
  const sort = pick("sort") === "name" ? "name" : pick("sort") === "open" || !canJoin ? "open" : "fit";

  const all = sortTeams(await listTeams(viewer.signedIn));
  const myTeam = myTeamId ? all.find((t) => t.id === myTeamId) : undefined;
  const words = query.toLowerCase();
  let teams = all.filter(
    (t) =>
      (!words || [t.name, t.concept, t.looking_for].some((text) => text?.toLowerCase().includes(words))) &&
      (!needs || !t.balance[needs]) &&
      (!onlyJoinable || (t.memberCount < TEAM_MAX && t.id !== myTeamId)),
  );

  // Best fit for me: how well the viewer fills what each team is missing, plus shared
  // interests (same scoring as the people page, from their side). Reasons use only roles and
  // words from their own public profile.
  const fits = new Map<string, Fit>();
  if (sort === "fit" && viewer.signedIn) {
    const [me] = await getMatchingProfiles([viewer.profile.id]).catch(() => []);
    if (me) for (const t of teams) fits.set(t.id, fitForViewer(t, me));
  }
  if (sort === "fit" && fits.size) {
    teams = [...teams].sort(
      (a, b) =>
        Number(a.memberCount >= TEAM_MAX) - Number(b.memberCount >= TEAM_MAX) ||
        (fits.get(b.id)?.score ?? 0) - (fits.get(a.id)?.score ?? 0) ||
        a.name.localeCompare(b.name),
    );
  } else if (sort === "name") {
    teams = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  }
  const filtered = Boolean(query || needs || onlyJoinable);
  const control = "rounded border border-line-strong bg-bg-raised px-3 py-2";
  const waiting = await inboxCount(viewer);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <DeadlineBanner />
      </div>
      {viewer.signedIn && <TeamsTabs active="teams" inboxCount={waiting} />}

      {waiting > 0 && (
        <p className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
          <strong>
            {waiting} {waiting === 1 ? "thing needs" : "things need"} your answer.
          </strong>{" "}
          <Link href="/teams/inbox" className="underline">
            Open your inbox
          </Link>
        </p>
      )}

      {!viewer.signedIn ? (
        <p className="text-sm">
          <Link href="/login" className="underline">
            Log in
          </Link>{" "}
          to create a team, see what teams are looking for, or apply.
        </p>
      ) : myTeam ? (
        <p className="text-sm">
          You&apos;re on{" "}
          <Link href={`/teams/${myTeam.id}`} className="font-semibold underline">
            {myTeam.name}
          </Link>
          .
        </p>
      ) : viewer.joinBlockedReason ? (
        <p className="rounded border border-line px-3 py-2 text-sm text-fg-muted">{viewer.joinBlockedReason}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/teams/new" className="btn">
            Create a team
          </Link>
          <span className="text-sm text-fg-muted">or find one below and apply.</span>
        </div>
      )}

      <form className="flex flex-wrap gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name, idea, or what they're looking for"
          aria-label="Search teams"
          className={`${control} min-w-0 flex-1 basis-full sm:basis-auto`}
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Needs</span>
          <select name="needs" defaultValue={needs} className={control}>
            {NEEDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {canJoin && (
          <label className={`${control} flex items-center gap-2 text-sm`}>
            <input type="checkbox" name="open" value="1" defaultChecked={onlyJoinable} /> Only teams I can join
          </label>
        )}
        <select name="sort" defaultValue={sort} aria-label="Order" className={control}>
          {canJoin && <option value="fit">Best fit for me</option>}
          <option value="open">Open teams first</option>
          <option value="name">Name</option>
        </select>
        <button type="submit" className="btn btn-ghost shrink-0">
          Filter
        </button>
        {filtered && (
          <Link href="/teams" className="self-center text-sm text-fg-muted underline">
            Clear
          </Link>
        )}
      </form>

      {(filtered || fits.size > 0) && teams.length > 0 && (
        <p className="text-sm text-fg-muted">
          {filtered ? `Showing ${teams.length} of ${all.length} teams` : `${teams.length} teams`}
          {fits.size > 0 && ", best fit for you first"}
        </p>
      )}

      {teams.length === 0 ? (
        <p className="text-fg-muted">
          {filtered ? "No teams match these filters." : "No teams yet. Be the first to start one."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id}>
              <TeamCard team={team} mine={team.id === myTeamId} reasons={fits.get(team.id)?.reasons ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamCard({ team, mine, reasons }: { team: TeamSummary; mine: boolean; reasons: string[] }) {
  const full = team.memberCount >= TEAM_MAX;
  return (
    <Link
      href={`/teams/${team.id}`}
      className="block h-full space-y-3 rounded-lg border border-line bg-bg-raised p-4 no-underline transition-colors hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold leading-snug">{team.name}</h2>
        <div className="flex shrink-0 gap-1">
          {mine && <Pill tone="accent">Your team</Pill>}
          {full ? <Pill>Full</Pill> : <Pill tone="warn">Open</Pill>}
        </div>
      </div>
      {team.concept && <p className="line-clamp-3 text-sm text-fg-muted">{team.concept}</p>}
      <p className="text-sm">
        <span className="font-medium">
          {team.memberCount} of {Math.max(TEAM_MAX, team.memberCount)}
        </span>{" "}
        <span className="text-fg-muted">members</span>
      </p>
      <BalanceBadges balance={team.balance} />
      {team.looking_for && (
        <p className="text-sm">
          <span className="font-medium">Looking for:</span> <span className="text-fg-muted">{team.looking_for}</span>
        </p>
      )}
      {reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Why it might fit you">
          {reasons.map((reason) => (
            <li key={reason} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-fg">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
