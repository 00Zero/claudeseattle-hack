"use client";

import Link from "next/link";
import { useState } from "react";
import { Pill } from "@/app/(teams)/teams/_components/badges";
import { ROLE_SHORT, type RoleBucket } from "@/lib/roles";

export type DirectoryPerson = {
  id: string; // profile id, or the Luma guest id for someone without an account
  hasAccount: boolean;
  name: string;
  work: string | null;
  email: string | null;
  ticket: string | null;
  platformRole: string;
  roleBucket: RoleBucket | null;
  technical: boolean;
  status: string | null;
  checkedIn: boolean;
  isLeader: boolean;
  team: { id: string; name: string } | null;
  canJoinTeam: boolean;
  search: string; // names, work, ticket and every email, for the search box
};

export type DirectoryTeam = { id: string; name: string; concept: string | null; members: DirectoryPerson[] };

const MAX_RESULTS = 50;

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending",
  waitlist: "Waitlist",
  declined: "Declined",
  cancelled: "Cancelled",
};
const ROLE_LABEL: Record<string, string> = { mentor: "Mentor", judge: "Judge", volunteer: "Volunteer", admin: "Admin" };

const nameLink = "font-medium underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground";

// Case and accents don't matter, so "jose" finds José.
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const plural = (count: number, word: string, words = `${word}s`) => `${count} ${count === 1 ? word : words}`;

function PersonRow({ person: p, showTeam }: { person: DirectoryPerson; showTeam: boolean }) {
  const status = p.status && STATUS_LABEL[p.status];
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {p.hasAccount ? (
            <Link href={`/teams/people/${p.id}`} prefetch={false} className={nameLink}>
              {p.name}
            </Link>
          ) : (
            <span className="font-medium">{p.name}</span>
          )}
          {p.isLeader && <Pill tone="accent">Leader</Pill>}
          {ROLE_LABEL[p.platformRole] && <Pill>{ROLE_LABEL[p.platformRole]}</Pill>}
          {p.roleBucket && p.platformRole !== "mentor" && <Pill>{ROLE_SHORT[p.roleBucket]}</Pill>}
          {p.technical && p.platformRole !== "mentor" && <Pill>Technical</Pill>}
          {status && <Pill tone="warn">{status}</Pill>}
          {!p.hasAccount && <Pill>No account</Pill>}
          {p.checkedIn && <Pill tone="live">Checked in</Pill>}
        </div>
        {p.work && <p className="text-xs text-foreground/70">{p.work}</p>}
        <p className="text-xs break-all text-foreground/50">{[p.email, p.ticket].filter(Boolean).join(" · ")}</p>
      </div>
      {showTeam &&
        (p.team ? (
          <Link href={`/teams/${p.team.id}`} prefetch={false} className={nameLink}>
            {p.team.name}
          </Link>
        ) : (
          <span className="text-foreground/50">No team</span>
        ))}
    </li>
  );
}

function TeamCard({ team }: { team: DirectoryTeam }) {
  return (
    <section className="overflow-hidden rounded border border-foreground/15">
      <div className="space-y-0.5 border-b border-foreground/10 bg-foreground/5 px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={`/teams/${team.id}`} prefetch={false} className={nameLink}>
            {team.name}
          </Link>
          <span className="shrink-0 text-xs text-foreground/60">{plural(team.members.length, "member")}</span>
        </div>
        {team.concept && <p className="line-clamp-2 text-xs text-foreground/70">{team.concept}</p>}
      </div>
      <ul className="divide-y divide-foreground/10">
        {team.members.map((m) => (
          <PersonRow key={m.id} person={m} showTeam={false} />
        ))}
      </ul>
    </section>
  );
}

function PeopleList({ people }: { people: DirectoryPerson[] }) {
  return (
    <ul className="divide-y divide-foreground/10 rounded border border-foreground/15">
      {people.map((p) => (
        <PersonRow key={p.id} person={p} showTeam />
      ))}
    </ul>
  );
}

// The search runs in the browser, so results change as you type. The query stays in the URL, so
// coming back from a team or person keeps it.
export function TeamsDirectory({
  teams,
  people,
  initialQuery,
}: {
  teams: DirectoryTeam[];
  people: DirectoryPerson[];
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);

  function search(value: string) {
    setQuery(value);
    const url = new URL(window.location.href);
    if (value.trim()) url.searchParams.set("q", value);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }

  const words = fold(query).split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = (text: string) => {
    const folded = fold(text);
    return words.every((word) => folded.includes(word));
  };
  const foundPeople = searching ? people.filter((p) => matches(p.search)) : [];
  const foundTeams = searching ? teams.filter((t) => matches(`${t.name} ${t.concept ?? ""}`)) : teams;

  const noTeam = people.filter((p) => p.canJoinTeam && !p.team);
  const onTeams = teams.reduce((sum, t) => sum + t.members.length, 0);
  const noAccount = people.filter((p) => !p.hasAccount).length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Teams</h1>
          <p className="text-sm text-foreground/70">
            {plural(teams.length, "team")}, {plural(onTeams, "person", "people")} on them, {noTeam.length} without one who
            can join. Search also finds the {plural(noAccount, "Luma guest")} with no account.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search name, email, company, ticket or team"
          aria-label="Search people and teams"
          autoFocus
          className="w-full rounded border border-foreground/20 bg-background px-3 py-2"
        />
      </div>

      {searching ? (
        <div className="space-y-6" aria-live="polite">
          {foundPeople.length === 0 && foundTeams.length === 0 && <p className="text-sm">No people or teams match.</p>}
          {foundPeople.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">People ({foundPeople.length})</h2>
              <PeopleList people={foundPeople.slice(0, MAX_RESULTS)} />
              {foundPeople.length > MAX_RESULTS && (
                <p className="text-sm text-foreground/70">Showing the first {MAX_RESULTS}. Keep typing to narrow it down.</p>
              )}
            </section>
          )}
          {foundTeams.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Teams ({foundTeams.length})</h2>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                {foundTeams.map((t) => (
                  <TeamCard key={t.id} team={t} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <>
          {teams.length === 0 ? (
            <p className="text-sm">No teams yet.</p>
          ) : (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {teams.map((t) => (
                <TeamCard key={t.id} team={t} />
              ))}
            </div>
          )}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">No team ({noTeam.length})</h2>
            <p className="text-sm text-foreground/70">Approved participants and mentors with an account who aren&apos;t on a team.</p>
            {noTeam.length > 0 && <PeopleList people={noTeam} />}
          </section>
        </>
      )}
    </div>
  );
}
