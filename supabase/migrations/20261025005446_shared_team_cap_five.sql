-- shared_team_cap_five: teams fill up at 5 members; only admins can add a 6th. Written by Dev A
-- (Teams); shared because it replaces the trigger function on team_members (a shared table)
-- from shared_member_cap.
--
-- Leaders accepting applicants and people accepting invites stop at 5. Admins (is_admin(),
-- through the admin panel on a team page) and service-role or SQL writes (no auth.uid()) can
-- still take a team to 6, the hard limit. Teams that already have 6 keep them; only new members
-- are checked. accept_team_invite() keeps its friendly 'team_full' result, now at 5.
--
-- Replaces two function bodies; no tables, columns, data, or policies change.

create or replace function teams_enforce_member_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_members int;
  v_cap int := case when auth.uid() is null or is_admin() then 6 else 5 end;
begin
  if new.status = 'member'
     and (tg_op = 'INSERT' or old.status is distinct from 'member' or old.team_id is distinct from new.team_id) then
    perform 1 from teams where id = new.team_id for update;
    select count(*) into v_members
      from team_members
     where team_id = new.team_id and status = 'member' and profile_id <> new.profile_id;
    if v_members >= v_cap then
      raise exception 'team_full: a team can have at most % members', v_cap using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

revoke execute on function teams_enforce_member_cap() from public, anon, authenticated;

create or replace function accept_team_invite(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_members int;
begin
  if v_uid is null then return 'not_signed_in'; end if;
  if not can_join_teams() then return 'not_allowed'; end if;
  if not exists (select 1 from teams_invites
                 where team_id = p_team and profile_id = v_uid and status = 'pending') then
    return 'no_invite';
  end if;
  if exists (select 1 from team_members where profile_id = v_uid and status = 'member') then
    return 'already_on_team';
  end if;

  perform 1 from teams where id = p_team for update;
  select count(*) into v_members from team_members where team_id = p_team and status = 'member';
  if v_members >= 5 then return 'team_full'; end if;

  insert into team_members (team_id, profile_id, status, joined_at)
  values (p_team, v_uid, 'member', now())
  on conflict (team_id, profile_id) do update set status = 'member', joined_at = now();

  update teams_invites set status = 'accepted', responded_at = now()
  where team_id = p_team and profile_id = v_uid;
  return 'ok';
end $$;

revoke execute on function accept_team_invite(uuid) from public, anon;
grant execute on function accept_team_invite(uuid) to authenticated;
