-- shared_application_limit: at most 3 open applications per person. Written by Dev A
-- (Teams); shared because it adds a trigger to team_members (a shared table).
--
-- "Open" means status = 'applied'. Withdrawn ('left'), declined ('rejected'), and accepted
-- applications don't count, so withdrawing frees a slot. Invites aren't affected. The app
-- checks first and explains; this trigger is the backstop for double-taps and other paths.
-- It locks the person's profile row so two applications at the same moment can't both see 2.
-- Existing rows aren't changed; only new or reopened applications are checked.

create or replace function teams_enforce_application_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_open int;
begin
  if new.status = 'applied' and (tg_op = 'INSERT' or old.status is distinct from 'applied') then
    perform 1 from profiles where id = new.profile_id for update;
    select count(*) into v_open
      from team_members
     where profile_id = new.profile_id and status = 'applied' and team_id <> new.team_id;
    if v_open >= 3 then
      raise exception 'too_many_applications: at most 3 open applications at a time' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

revoke execute on function teams_enforce_application_limit() from public, anon, authenticated;

create trigger team_members_application_limit before insert or update of status on team_members
  for each row execute function teams_enforce_application_limit();
