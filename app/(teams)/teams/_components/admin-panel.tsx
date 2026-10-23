import "server-only";
import { createClient } from "@/lib/supabase/server";
import { adminAddMember, adminDeleteTeam, adminMakeLeader, adminMoveMember, adminRemoveMember } from "../admin-actions";
import { joinableIds, TEAM_MAX } from "../_lib/teams";
import { ActionButton } from "./action-button";
import { NO_NAME, type Person } from "./person";
import { SelectAction } from "./select-action";

const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim() || NO_NAME;

// Other teams (to move someone to) and people without a team (to add), for the dropdowns.
async function loadChoices(teamId: string) {
  const supabase = await createClient();
  const eligible = await joinableIds();
  let peopleQuery = supabase.from("profiles").select("id, first_name, last_name");
  peopleQuery = eligible
    ? peopleQuery.in("id", [...eligible])
    : peopleQuery.eq("luma_status", "approved").in("platform_role", ["participant", "mentor"]);
  const [teams, people, members] = await Promise.all([
    supabase.from("teams").select("id, name, team_members(status)").neq("id", teamId).order("name"),
    peopleQuery,
    supabase.from("team_members").select("profile_id").eq("status", "member"),
  ]);
  const onTeam = new Set((members.data ?? []).map((m) => m.profile_id));
  return {
    teams: (teams.data ?? []).map((t) => {
      const size = (t.team_members as { status: string }[]).filter((m) => m.status === "member").length;
      return { value: t.id, label: `${t.name} (${size}/${TEAM_MAX})`, disabled: size >= TEAM_MAX };
    }),
    people: (people.data ?? [])
      .filter((p) => !onTeam.has(p.id))
      .map((p) => ({ value: p.id, label: fullName(p) }))
      .sort((a, b) => Number(a.label === NO_NAME) - Number(b.label === NO_NAME) || a.label.localeCompare(b.label)),
  };
}

// Organizer tools at the bottom of a team page; shown to admins only.
export async function AdminPanel({ teamId, teamName, members }: { teamId: string; teamName: string; members: Person[] }) {
  const { teams, people } = await loadChoices(teamId);
  const fields = { team_id: teamId };
  const full = members.length >= TEAM_MAX;

  return (
    <section className="space-y-4 rounded-lg border border-dashed border-line-strong p-4" aria-label="Organizer tools">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Organizer tools</h2>
        <p className="text-sm text-fg-muted">Only admins see this. Changes apply right away, including after the deadline.</p>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
        {members.map((m) => (
          <li key={m.id} className="space-y-2 px-4 py-3">
            <p className="text-sm">
              <span className="font-medium">{m.name}</span>
              {m.is_leader && <span className="text-fg-muted"> · leader</span>}
            </p>
            {m.is_leader ? (
              <p className="text-sm text-fg-muted">To move or remove the leader, make someone else leader first.</p>
            ) : (
              <>
                <SelectAction
                  action={adminMoveMember}
                  fields={{ ...fields, profile_id: m.id! }}
                  name="to_team_id"
                  options={teams}
                  placeholder="Move to team…"
                  label="Move"
                  pendingLabel="Moving…"
                />
                <div className="flex flex-wrap gap-4">
                  <ActionButton
                    action={adminMakeLeader}
                    fields={{ ...fields, profile_id: m.id! }}
                    label="Make leader"
                    pendingLabel="Saving…"
                    confirm={`Make ${m.name} the leader of ${teamName}?`}
                    variant="link"
                  />
                  <ActionButton
                    action={adminRemoveMember}
                    fields={{ ...fields, profile_id: m.id! }}
                    label="Remove from team"
                    pendingLabel="Removing…"
                    confirm={`Remove ${m.name} from ${teamName}?`}
                    variant="link"
                  />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-1">
        <h3 className="text-sm font-medium">Add someone without a team</h3>
        {full ? (
          <p className="text-sm text-fg-muted">This team is full ({TEAM_MAX} people).</p>
        ) : people.length ? (
          <SelectAction
            action={adminAddMember}
            fields={fields}
            name="profile_id"
            options={people}
            placeholder="Choose a person…"
            label="Add to team"
            pendingLabel="Adding…"
          />
        ) : (
          <p className="text-sm text-fg-muted">Everyone who can join a team is on one.</p>
        )}
      </div>

      <ActionButton
        action={adminDeleteTeam}
        fields={fields}
        label="Delete team"
        pendingLabel="Deleting…"
        confirm={`Delete ${teamName}? Its members will be free to join other teams. This can't be undone.`}
        variant="link"
      />
    </section>
  );
}
