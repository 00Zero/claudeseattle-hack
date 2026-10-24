-- shared_expire_on_join: once someone joins a team, their other open invites and
-- applications expire. Written by Dev A (Teams); shared because it adds a trigger to
-- team_members (a shared table).
--
-- "Joins" means any path that makes them a member: accepting an invite, a leader accepting
-- their application, creating a team (the leader becomes a member), or an organizer adding
-- or moving them. In the same transaction:
--   - their other pending teams_invites become 'expired' (a new status), and
--   - their other 'applied' team_members rows become 'left' (withdrawn), so leaders stop
--     seeing them as applicants.
-- accept_team_invite() already refuses people who are on a team; after this, their old
-- invites aren't even pending.
--
-- No existing rows change when this migration runs; only future joins trigger it.

alter table teams_invites drop constraint teams_invites_status_check;
alter table teams_invites add constraint teams_invites_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired'));

create or replace function expire_other_offers_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'member' and (tg_op = 'INSERT' or old.status is distinct from 'member') then
    update teams_invites
       set status = 'expired', responded_at = now()
     where profile_id = new.profile_id and team_id <> new.team_id and status = 'pending';

    update team_members
       set status = 'left'
     where profile_id = new.profile_id and team_id <> new.team_id and status = 'applied';
  end if;
  return new;
end $$;

revoke execute on function expire_other_offers_on_join() from public, anon, authenticated;

create trigger team_members_expire_on_join after insert or update of status on team_members
  for each row execute function expire_other_offers_on_join();
