import "server-only";
import { getMatchingProfiles } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import { inviteToTeam } from "../actions";
import { NoteForm } from "./note-form";
import { rankForTeam, type TeamContext } from "../_lib/ai";
import { PERSON_COLUMNS, PersonDetails, personFromProfile, type ProfileRow } from "./person";

const SHOWN = 5;

// "Top picks" on the people page: Claude re-ranks the shortlist the scoring rule produced and
// says why, in derived words only (see _lib/ai.ts). Rendered inside <Suspense>, so the rest of
// the page doesn't wait; shows nothing if the model is unavailable.
export async function TopPicks({
  team,
  shortlist,
  canInvite,
  invited,
}: {
  team: TeamContext;
  shortlist: string[];
  canInvite: boolean;
  invited: Set<string>;
}) {
  if (!shortlist.length) return null;
  const signals = await getMatchingProfiles(shortlist).catch(() => []);
  const ordered = shortlist.map((id) => signals.find((s) => s.profile_id === id)).filter((s) => s !== undefined);
  const picks = await rankForTeam(team, ordered);
  if (!picks?.length) return null;

  const top = picks.slice(0, SHOWN);
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PERSON_COLUMNS).in("id", top.map((p) => p.profileId));
  const profiles = new Map(((data ?? []) as unknown as ProfileRow[]).map((p) => [p.id, p]));

  return (
    <section className="space-y-3 rounded-lg border border-accent/60 p-4" aria-label="Top picks">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Top picks for {team.name}</h2>
        <p className="text-sm text-fg-muted">Ranked by Claude from profiles and what your team is missing. Say hi, or invite them.</p>
      </div>
      <ol className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
        {top.map((pick) => {
          const profile = profiles.get(pick.profileId);
          if (!profile) return null;
          return (
            <li key={pick.profileId} className="space-y-2 px-4 py-3">
              <PersonDetails person={personFromProfile(profile)} />
              {pick.reason && <p className="text-sm">✦ {pick.reason}</p>}
              {canInvite &&
                (invited.has(pick.profileId) ? (
                  <p className="text-sm font-medium">✓ Invited to {team.name}</p>
                ) : (
                  <NoteForm
                      action={inviteToTeam}
                    fields={{ team_id: team.id, profile_id: pick.profileId }}
                    label={`Invite to ${team.name}`}
                    pendingLabel="Inviting…"
                    variant="ghost"
                      submitLabel="Send invite"
                      placeholder="Why do you want them on your team?"
                      collapsed
                    />
                ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function TopPicksLoading({ teamName }: { teamName: string }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-fg-muted" role="status">
      Claude is looking for the best fits for {teamName}…
    </p>
  );
}
