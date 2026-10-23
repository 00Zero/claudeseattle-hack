import Link from "next/link";
import { redirect } from "next/navigation";
import { BalanceBadges, Pill } from "./_components/badges";
import { DeadlineBanner } from "./_components/deadline-banner";
import { TeamsTabs } from "./_components/teams-tabs";
import { getMyInvites, getViewer, listTeams, sortTeams, TEAM_MAX, type TeamSummary } from "./_lib/teams";

export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  const viewer = await getViewer();
  if (viewer.signedIn && viewer.access === "blocked") redirect("/declined");
  if (viewer.signedIn && viewer.access !== "full") redirect("/pending");
  // Teams need to know who you are: confirm the Luma-filled profile first (sign-in does this too).
  if (viewer.signedIn && !viewer.profile.profile_confirmed) redirect("/profile");

  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim();
  const all = sortTeams(await listTeams(viewer.signedIn));
  const teams = query ? all.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())) : all;
  const myTeamId = viewer.signedIn ? viewer.myTeamId : null;
  const myTeam = myTeamId ? all.find((t) => t.id === myTeamId) : undefined;
  const invites = viewer.signedIn ? await getMyInvites(viewer.profile.id) : [];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <DeadlineBanner />
      </div>
      {viewer.signedIn && <TeamsTabs active="teams" />}

      {invites.length > 0 && (
        <ul className="space-y-2" aria-label="Your invites">
          {invites.map((invite) => (
            <li key={invite.teamId} className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
              <strong>You&apos;re invited to join {invite.teamName}.</strong>{" "}
              <Link href={`/teams/${invite.teamId}`} className="underline">
                See the team and accept or decline
              </Link>
            </li>
          ))}
        </ul>
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

      <form className="flex gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search teams by name"
          aria-label="Search teams by name"
          className="w-full rounded border border-line-strong bg-bg-raised px-3 py-2"
        />
        <button type="submit" className="btn btn-ghost shrink-0">
          Search
        </button>
      </form>

      {teams.length === 0 ? (
        <p className="text-fg-muted">
          {query ? `No teams match “${query}”.` : "No teams yet. Be the first to start one."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id}>
              <TeamCard team={team} mine={team.id === myTeamId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamCard({ team, mine }: { team: TeamSummary; mine: boolean }) {
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
          {team.memberCount} of {TEAM_MAX}
        </span>{" "}
        <span className="text-fg-muted">members</span>
      </p>
      <BalanceBadges balance={team.balance} />
      {team.looking_for && (
        <p className="text-sm">
          <span className="font-medium">Looking for:</span> <span className="text-fg-muted">{team.looking_for}</span>
        </p>
      )}
    </Link>
  );
}
