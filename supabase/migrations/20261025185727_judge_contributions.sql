-- judge_contributions: "who did what", one row per teammate. Anyone on the team can write any
-- teammate's part on /submit; each part saves on its own (the app only writes a part if nobody
-- saved it since the editor loaded it), so saving one can't overwrite another.
-- judge_entries.contributions (one shared text) stays for what teams wrote before; the form no
-- longer edits it.
--
-- judge_set_teammate_github: a teammate may fill in a missing GitHub username for someone on their
-- team, so judges can find everyone's commits. It only fills a blank one; people change their own
-- on /profile.

create table judge_contributions (
  team_id     uuid not null references teams (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 2000),
  updated_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (team_id, profile_id)
);
create trigger judge_contributions_updated before update on judge_contributions
  for each row execute function set_updated_at();

-- Who saved a part last, for "saved by" on /submit. Set here so nobody can claim someone else.
create or replace function judge_contributions_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_by := auth.uid();
  return new;
end
$$;
create trigger judge_contributions_stamped before insert or update on judge_contributions
  for each row execute function judge_contributions_stamp();

-- The person is a current member of the team (a part can only be about a teammate).
create or replace function judge_team_has_member(p_team uuid, p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members
                  where team_id = p_team and profile_id = p_profile and status = 'member')
$$;
revoke execute on function judge_team_has_member(uuid, uuid) from public, anon;
grant execute on function judge_team_has_member(uuid, uuid) to authenticated;

revoke all on judge_contributions from anon;
revoke insert, update on judge_contributions from authenticated;
grant insert (team_id, profile_id, body), update (body) on judge_contributions to authenticated;

alter table judge_contributions enable row level security;

-- The team and judges read; any member who may submit writes any teammate's part, before the
-- deadline.
create policy contributions_read on judge_contributions for select
  using (is_judge() or is_team_member(team_id));
create policy contributions_create on judge_contributions for insert
  with check (is_team_member(team_id) and judge_team_has_member(team_id, profile_id)
              and judge_can_submit() and judge_submissions_open());
create policy contributions_edit on judge_contributions for update
  using (is_team_member(team_id))
  with check (is_team_member(team_id) and judge_team_has_member(team_id, profile_id)
              and judge_can_submit() and judge_submissions_open());
create policy contributions_admin on judge_contributions for all using (is_admin()) with check (is_admin());

create policy contributions_same_world on judge_contributions as restrictive for all to authenticated
  using (team_is_test(team_id) = (select viewer_is_test()))
  with check (team_is_test(team_id) = (select viewer_is_test()));

-- True if it set the username; false if the person isn't on the caller's team or already has one.
create or replace function judge_set_teammate_github(p_profile uuid, p_username text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  changed int;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9-]{1,39}$' then
    raise exception 'invalid GitHub username';
  end if;
  if not judge_can_submit() or not exists (
    select 1 from team_members mine
      join team_members theirs on theirs.team_id = mine.team_id
     where mine.profile_id = auth.uid() and mine.status = 'member'
       and theirs.profile_id = p_profile and theirs.status = 'member'
  ) then
    return false;
  end if;
  update profiles set github_username = p_username
   where id = p_profile and coalesce(trim(github_username), '') = '';
  get diagnostics changed = row_count;
  return changed > 0;
end
$$;
revoke execute on function judge_set_teammate_github(uuid, text) from public, anon;
grant execute on function judge_set_teammate_github(uuid, text) to authenticated;
