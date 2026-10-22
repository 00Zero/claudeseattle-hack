-- teams_invites: a team leader invites someone; the invitee accepts or declines from the
-- team page. Owned by Dev A (Teams). docs/REQUIREMENTS.md, Teams nice-to-have 1 and 2.
--
-- One row per team and person. Re-inviting after a decline or cancel sets the row back to
-- 'pending'. Accepting goes through accept_team_invite(), because invitees can't add
-- themselves to team_members as 'member' (members_apply only allows 'applied').

create table teams_invites (
  team_id       uuid not null references teams (id) on delete cascade,
  profile_id    uuid not null references profiles (id) on delete cascade,
  invited_by    uuid not null references profiles (id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (team_id, profile_id)
);
create index teams_invites_pending_by_profile on teams_invites (profile_id) where status = 'pending';

alter table teams_invites enable row level security;

-- The invitee, the team's leader, and admins see an invite.
create policy teams_invites_read on teams_invites for select
  using (profile_id = (select auth.uid()) or is_team_leader(team_id) or is_admin());

-- Only the team's leader creates invites, as themselves, for someone else.
create policy teams_invites_create on teams_invites for insert
  with check (is_team_leader(team_id) and invited_by = (select auth.uid())
              and profile_id <> (select auth.uid()) and status = 'pending');

-- The leader re-invites (pending) or cancels. The invitee only declines; accepting is the
-- function below. Permissive policies are OR'ed, so each WITH CHECK limits its own side.
create policy teams_invites_leader_update on teams_invites for update
  using (is_team_leader(team_id))
  with check (is_team_leader(team_id) and status in ('pending', 'cancelled'));
create policy teams_invites_invitee_update on teams_invites for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and status = 'declined');

create policy teams_invites_admin on teams_invites for all using (is_admin()) with check (is_admin());

-- Only status and responded_at change after insert; no deletes (no policy).
revoke all on teams_invites from anon;
revoke update on teams_invites from authenticated;
grant update (status, responded_at) on teams_invites to authenticated;

-- Accept a pending invite to p_team as the current user: checks they can join teams, aren't
-- on a team, and the team has room (6), then makes them a member and marks the invite
-- accepted. Returns 'ok' or a reason the app turns into a message. The row lock on the team
-- serializes concurrent accepts for the size check; one_team_per_person still guards the rest.
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
  if v_members >= 6 then return 'team_full'; end if;

  insert into team_members (team_id, profile_id, status, joined_at)
  values (p_team, v_uid, 'member', now())
  on conflict (team_id, profile_id) do update set status = 'member', joined_at = now();

  update teams_invites set status = 'accepted', responded_at = now()
  where team_id = p_team and profile_id = v_uid;
  return 'ok';
end $$;

revoke execute on function accept_team_invite(uuid) from public, anon;
grant execute on function accept_team_invite(uuid) to authenticated;
