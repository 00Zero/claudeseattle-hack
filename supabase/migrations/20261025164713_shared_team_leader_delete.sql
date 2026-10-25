-- shared_team_leader_delete: a team's leader can delete their own team until team formation
-- closes. Written by Dev A (Teams); shared because it adds a policy to teams (a shared table).
--
-- Deleting a team frees everyone on it, the leader included: team_members, teams_invites and
-- teams_application_notes rows go with it (on delete cascade). A team with a judging entry can't
-- be deleted, because judge_entries.team_id has no cascade, so the delete fails and the app says
-- so. Admins could already delete any team (teams_admin); this adds nothing for them.
--
-- Adds one policy; no tables, columns, or data change.

create policy teams_leader_delete on teams for delete
  using (
    leader_id = (select auth.uid())
    and coalesce(now() < (select team_formation_closes_at from event_settings where id = 1), true)
  );
