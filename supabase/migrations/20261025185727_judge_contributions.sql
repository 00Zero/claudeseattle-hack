-- judge_contributions: "who did what", one row per teammate. Anyone on the team can write any
-- teammate's part on /submit; each part saves on its own (the app only writes a part if nobody
-- saved it since the editor loaded it), so saving one can't overwrite another.
-- judge_entries.contributions (one shared text) stays for what teams wrote before; the form no
-- longer edits it.
--
-- github_username: for a teammate whose profile has none, anyone on the team can add one here so
-- judges can find their commits. profiles stays edited only by its owner; their own username on
-- /profile wins when both exist.

create table judge_contributions (
  team_id          uuid not null references teams (id) on delete cascade,
  profile_id       uuid not null references profiles (id) on delete cascade,
  body             text not null default '' check (char_length(body) <= 2000),
  updated_at       timestamptz,                                    -- body last saved; null = never written
  updated_by       uuid references profiles (id) on delete set null,
  github_username  text check (github_username ~ '^[A-Za-z0-9-]{1,39}$'),
  github_set_by    uuid references profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (team_id, profile_id)
);

-- Who saved the part, and when, changes only when the text does, so adding a GitHub username
-- doesn't make a teammate's open edit look stale. Set here so nobody can claim someone else.
create or replace function judge_contributions_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := case when new.body <> '' then now() end;
    new.updated_by := case when new.body <> '' then auth.uid() end;
    new.github_set_by := case when new.github_username is not null then auth.uid() end;
  else
    if new.body is distinct from old.body then
      new.updated_at := now();
      new.updated_by := auth.uid();
    else
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
    end if;
    new.github_set_by := case when new.github_username is distinct from old.github_username then auth.uid() else old.github_set_by end;
  end if;
  return new;
end
$$;
revoke execute on function judge_contributions_stamp() from public, anon, authenticated;
create trigger judge_contributions_stamped before insert or update on judge_contributions
  for each row execute function judge_contributions_stamp();

revoke all on judge_contributions from anon;
revoke insert, update on judge_contributions from authenticated;
grant insert (team_id, profile_id, body, github_username), update (body, github_username)
  on judge_contributions to authenticated;

alter table judge_contributions enable row level security;

-- The team and judges read; any member who may submit writes any current teammate's part, before
-- the deadline. The membership check runs as the caller, who can read team_members (can_browse).
create policy contributions_read on judge_contributions for select
  using (is_judge() or is_team_member(team_id));
create policy contributions_create on judge_contributions for insert
  with check (is_team_member(team_id) and judge_can_submit() and judge_submissions_open()
              and exists (select 1 from team_members m
                           where m.team_id = judge_contributions.team_id
                             and m.profile_id = judge_contributions.profile_id
                             and m.status = 'member'));
create policy contributions_edit on judge_contributions for update
  using (is_team_member(team_id))
  with check (is_team_member(team_id) and judge_can_submit() and judge_submissions_open()
              and exists (select 1 from team_members m
                           where m.team_id = judge_contributions.team_id
                             and m.profile_id = judge_contributions.profile_id
                             and m.status = 'member'));
create policy contributions_admin on judge_contributions for all using (is_admin()) with check (is_admin());

create policy contributions_same_world on judge_contributions as restrictive for all to authenticated
  using (team_is_test(team_id) = (select viewer_is_test()))
  with check (team_is_test(team_id) = (select viewer_is_test()));
