-- shared_disband_team: a team's leader can disband it, so everyone on it (the leader included)
-- is free to join another team. Written by Admin for the Teams app; shared because it deletes
-- rows in teams (a shared table), which leaders otherwise can't (no delete policy).
--
-- disband_team() deletes the team; its team_members, teams_invites, and teams_notes rows go
-- with it (on delete cascade). It refuses a team that has a judging entry or a late save, the
-- same rule as the admin "Delete team" action (judge_entries keeps its team reference on
-- purpose). Admins keep deleting teams through teams_admin.
--
-- Adds one function; no tables, columns, data, or policies change.

create or replace function disband_team(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return 'not_signed_in'; end if;
  perform 1 from teams where id = p_team and leader_id = v_uid for update;
  if not found then return 'not_leader'; end if;
  if exists (select 1 from judge_entries where team_id = p_team)
     or exists (select 1 from judge_late_saves where team_id = p_team) then
    return 'has_entry';
  end if;

  delete from teams where id = p_team;
  return 'ok';
end $$;

revoke execute on function disband_team(uuid) from public, anon;
grant execute on function disband_team(uuid) to authenticated;
