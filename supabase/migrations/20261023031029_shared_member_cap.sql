-- shared_member_cap: at most 6 members per team, enforced in the database. Written by Dev A
-- (Teams); shared because it adds a trigger to team_members (a shared table), so every write
-- path is covered, admin and service-role writes included. docs/REQUIREMENTS.md, Teams:
-- "Team size 2–6 enforced".
--
-- The app checks the size before accepting, inviting, moving, or adding, but two of those at
-- the same moment could both see 5 and make 7. This trigger takes a row lock on the team
-- and counts again, so concurrent changes to one team run one at a time and the 7th fails
-- with 'team_full', which the app turns into "This team is full".
--
-- Adds a trigger to team_members; the table's columns, data, and policies are unchanged.
-- accept_team_invite() keeps its own size check for a friendly result code; this trigger is
-- the backstop for every path.

create or replace function teams_enforce_member_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_members int;
begin
  if new.status = 'member'
     and (tg_op = 'INSERT' or old.status is distinct from 'member' or old.team_id is distinct from new.team_id) then
    perform 1 from teams where id = new.team_id for update;
    select count(*) into v_members
      from team_members
     where team_id = new.team_id and status = 'member' and profile_id <> new.profile_id;
    if v_members >= 6 then
      raise exception 'team_full: a team can have at most 6 members' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

revoke execute on function teams_enforce_member_cap() from public, anon, authenticated;

create trigger teams_member_cap before insert or update of status, team_id on team_members
  for each row execute function teams_enforce_member_cap();
