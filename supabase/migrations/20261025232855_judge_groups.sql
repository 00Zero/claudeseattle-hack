-- judge_groups: judging groups of several judges who score the same entries together.
-- Owned by Dev B (judging); see app/(judge)/CLAUDE.md.
-- - A judge belongs to at most one group. A judge in no group is a one-person group, which is
--   how judging worked before, so nothing changes until an admin creates a group.
-- - judge_assignments stays the per-judge source of who may score what (RLS, judge_is_assigned):
--   the admin app gives every member of a group a row for each of the group's entries
--   (app/admin/judging/actions.ts).
-- - A group's finalist is its top entry by the mean of its members' prelim scores; exact ties
--   produce no finalist, as before. judge_entry_results keeps its columns; only the prelim
--   ranking now partitions by group (or by judge, for a judge in no group).
-- - Groups live in one world (is_test), like their judges (shared_test_accounts).

create table judge_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  is_test     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table judge_group_members (
  judge_id    uuid primary key references profiles (id) on delete cascade,
  group_id    uuid not null references judge_groups (id) on delete cascade,
  added_at    timestamptz not null default now()
);
create index on judge_group_members (group_id);

-- Written by admins with the service role after assertAdmin(). Judges read groups and members
-- (names only come through profiles, which judges can already browse) to see who they judge with.
revoke all on judge_groups, judge_group_members from anon;
revoke insert, update, delete on judge_groups, judge_group_members from authenticated;

alter table judge_groups        enable row level security;
alter table judge_group_members enable row level security;

create policy groups_read on judge_groups for select using (is_judge());
create policy groups_admin on judge_groups for all using (is_admin()) with check (is_admin());
create policy group_members_read on judge_group_members for select using (is_judge());
create policy group_members_admin on judge_group_members for all using (is_admin()) with check (is_admin());

create policy groups_same_world on judge_groups as restrictive for all to authenticated
  using (is_test = (select viewer_is_test()))
  with check (is_test = (select viewer_is_test()));
create policy group_members_same_world on judge_group_members as restrictive for all to authenticated
  using (profile_is_test(judge_id) = (select viewer_is_test()))
  with check (profile_is_test(judge_id) = (select viewer_is_test()));

-- judge_entry_results: same columns as shared_test_accounts. The prelim ranking is per group:
-- an entry's group score is the mean of its assigned members' prelim scores.
create or replace view judge_entry_results as
  with per_judge as (
    select s.entry_id, s.judge_id, s.round,
           (select avg(x) from unnest(s.scores) as x) as score
    from judge_scores s
  ),
  group_scores as (
    select coalesce(gm.group_id, a.judge_id) as unit, a.entry_id, avg(pj.score) as score
    from judge_assignments a
    left join judge_group_members gm on gm.judge_id = a.judge_id
    left join per_judge pj
      on pj.entry_id = a.entry_id and pj.judge_id = a.judge_id and pj.round = 'prelim'
    group by 1, 2
  ),
  prelim_ranked as (
    select unit, entry_id, score,
           rank() over (partition by unit order by score desc nulls last) as rnk,
           count(*) over (partition by unit, score) as same_score
    from group_scores
  ),
  group_top as (
    select distinct entry_id from prelim_ranked
    where rnk = 1 and score is not null and same_score = 1
  ),
  totals as (
    select e.id as entry_id, e.team_id,
           coalesce(t.name, e.fallback_team_name) as team_name,
           e.title,
           e.last_saved_at,
           (e.last_saved_at is not null) as submitted,
           exists (select 1 from judge_late_saves l where l.team_id = e.team_id) as late,
           exists (select 1 from judge_late_saves l
                    where l.team_id = e.team_id and l.decision = 'pending') as late_pending,
           (select round(avg(score), 1) from per_judge
             where entry_id = e.id and round = 'prelim') as prelim_score,
           (select count(*) from per_judge
             where entry_id = e.id and round = 'prelim') as prelim_votes,
           (select round(avg(score), 1) from per_judge
             where entry_id = e.id and round = 'final') as final_score,
           (select count(*) from per_judge
             where entry_id = e.id and round = 'final') as final_votes,
           coalesce(e.finalist_override, e.id in (select entry_id from group_top)) as is_finalist,
           coalesce(l.is_test, false) as is_test
    from judge_entries e
    left join teams t on t.id = e.team_id
    left join profiles l on l.id = t.leader_id
  )
  select entry_id, team_id, team_name, title, last_saved_at, submitted, late, late_pending,
         prelim_score, prelim_votes, final_score, final_votes, is_finalist,
         case when is_finalist and final_score is not null
              then rank() over (partition by (is_finalist and final_score is not null), is_test
                                order by final_score desc) end as place,
         is_test
  from totals;
revoke all on judge_entry_results from anon, authenticated;
