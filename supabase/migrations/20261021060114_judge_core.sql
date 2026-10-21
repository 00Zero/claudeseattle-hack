-- judge_core: entries, late saves, assignments, scores, AI notes, and the views that rank them.
-- Owned by Dev B (judging); see app/(judge)/CLAUDE.md and app/(judge)/PLAN.md.
-- - Reads teams / team_members / profiles / event_settings; never writes them.
-- - Scores are four criteria, 1–8 each, stored as an array in the order of `rubric.criteria`
--   in lib/event.ts. Criterion names and anchors can change there; changing the count needs a
--   new migration for the check below.
-- - Scores, assignments, and AI notes are never readable by anon or participants. Public pages
--   read only public_judge_entries and public_judge_results.

create type judge_round as enum ('prelim', 'final');
create type judge_late_decision as enum ('pending', 'accepted', 'rejected');

-- ---------------------------------------------------------------
-- Entries: one per team. team_id is null only for the fallback (team not on the Teams app),
-- which an admin creates with a free-text team name and member emails.
-- ---------------------------------------------------------------
create table judge_entries (
  id                      uuid primary key default gen_random_uuid(),
  team_id                 uuid unique references teams (id),
  fallback_team_name      text,
  fallback_member_emails  text[],
  title                   text not null default '',
  tagline                 text,
  description_short       text,
  description_long        text,
  video_url               text,
  repo_url                text,
  links                   jsonb not null default '[]',   -- [{ "label": text, "url": text }]
  checklist               jsonb not null default '{}',   -- last completeness check, shown to the team
  finalist_override       boolean,                       -- admin: null = use the prelim ranking
  last_saved_at           timestamptz,                   -- null = never submitted
  last_saved_by           uuid references profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (team_id is not null or fallback_team_name is not null)
);
create trigger judge_entries_updated before update on judge_entries
  for each row execute function set_updated_at();

-- A save after submissions_close_at. Kept apart from the entry until an admin accepts it
-- (the app copies payload onto the team's entry, creating it if the team never saved before
-- the deadline) or rejects it. Keyed on the team for that reason.
create table judge_late_saves (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams (id) on delete cascade,
  saved_by    uuid not null default auth.uid() references profiles (id) on delete cascade,
  saved_at    timestamptz not null default now(),
  payload     jsonb not null,
  decision    judge_late_decision not null default 'pending',
  decided_by  uuid references profiles (id) on delete set null,
  decided_at  timestamptz
);
create index on judge_late_saves (team_id);

-- Prelim: which judge reviews which entry. The final round needs no assignments: every judge
-- scores every finalist.
create table judge_assignments (
  entry_id     uuid not null references judge_entries (id) on delete cascade,
  judge_id     uuid not null references profiles (id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  primary key (entry_id, judge_id)
);
create index on judge_assignments (judge_id);

create table judge_scores (
  entry_id    uuid not null references judge_entries (id) on delete cascade,
  judge_id    uuid not null references profiles (id) on delete cascade,
  round       judge_round not null,
  scores      smallint[] not null,
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (entry_id, judge_id, round),
  check (cardinality(scores) = 4 and array_position(scores, null) is null
         and 1 <= all (scores) and 8 >= all (scores))
);
create trigger judge_scores_updated before update on judge_scores
  for each row execute function set_updated_at();

-- Claude's notes per entry (nice-to-have). Written server-side with the service role.
create table judge_ai_notes (
  entry_id      uuid primary key references judge_entries (id) on delete cascade,
  model         text not null,
  notes         jsonb not null,   -- [{ "criterion": text, "note": text }] in rubric order
  draft_scores  smallint[],
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Stamp who saved an entry and when. Only for logged-in callers; service-role writes
-- (admin accepting a late save) set the columns themselves.
-- ---------------------------------------------------------------
create or replace function judge_stamp_entry() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.last_saved_by := auth.uid();
    new.last_saved_at := now();
  end if;
  return new;
end $$;
create trigger judge_entries_stamp before insert or update on judge_entries
  for each row execute function judge_stamp_entry();
revoke execute on function judge_stamp_entry() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Results. Runs as owner on purpose (bypasses RLS); service role only.
-- Entry score = mean of the four criteria for one judge. Prelim and final scores are the mean
-- of that across judges. A judge's finalist is the top prelim score among their assigned
-- entries; exact ties produce no finalist until the judge adjusts a score.
-- ---------------------------------------------------------------
create view judge_entry_results as
  with per_judge as (
    select s.entry_id, s.judge_id, s.round,
           (select avg(x) from unnest(s.scores) as x) as score
    from judge_scores s
  ),
  prelim_ranked as (
    select a.judge_id, a.entry_id, pj.score,
           rank() over (partition by a.judge_id order by pj.score desc nulls last) as rnk,
           count(*) over (partition by a.judge_id, pj.score) as same_score
    from judge_assignments a
    left join per_judge pj
      on pj.entry_id = a.entry_id and pj.judge_id = a.judge_id and pj.round = 'prelim'
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
           coalesce(e.finalist_override, e.id in (select entry_id from group_top)) as is_finalist
    from judge_entries e
    left join teams t on t.id = e.team_id
  )
  select totals.*,
         case when is_finalist and final_score is not null
              then rank() over (partition by (is_finalist and final_score is not null)
                                order by final_score desc) end as place
  from totals;
revoke all on judge_entry_results from anon, authenticated;
comment on view judge_entry_results is
  'Judging scores and ranking. Service role only, server-side only. Runs as owner on purpose.';

-- ---------------------------------------------------------------
-- Helpers for RLS
-- ---------------------------------------------------------------
-- May submit at all: full access as participant or admin (mentors are members but don't submit).
create or replace function judge_can_submit() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_access() = 'full'
                  and current_profile_role() in ('participant', 'admin'), false)
$$;

create or replace function judge_submissions_open() returns boolean
language sql stable security definer set search_path = public as $$
  select now() < submissions_close_at from event_settings where id = 1
$$;

-- The caller may edit this entry: a member of its team who may submit.
create or replace function judge_can_edit_entry(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select judge_can_submit() and exists (
    select 1 from judge_entries e
     where e.id = p_entry and e.team_id is not null and is_team_member(e.team_id))
$$;

create or replace function judge_is_assigned(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from judge_assignments
                  where entry_id = p_entry and judge_id = auth.uid())
$$;

create or replace function judge_is_finalist(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_finalist from judge_entry_results where entry_id = p_entry), false)
$$;

-- ---------------------------------------------------------------
-- Public views: entries after the deadline; finalists and places only once published.
-- Members come from public_team_members. Never scores, assignments, or AI notes.
-- ---------------------------------------------------------------
create view public_judge_entries as
  select e.id, e.team_id, coalesce(t.name, e.fallback_team_name) as team_name,
         e.title, e.tagline, e.description_short, e.description_long,
         e.video_url, e.repo_url, e.links
  from judge_entries e
  left join teams t on t.id = e.team_id
  where e.last_saved_at is not null
    and now() >= (select submissions_close_at from event_settings where id = 1);

create view public_judge_results as
  select r.entry_id, r.team_id, r.team_name, r.title,
         case when s.publish_winners then r.place end as place
  from judge_entry_results r
  cross join event_settings s
  where s.id = 1 and r.is_finalist and (s.publish_finalists or s.publish_winners);

grant select on public_judge_entries, public_judge_results to anon, authenticated;

-- ---------------------------------------------------------------
-- Grants: members write only the entry's content columns.
-- ---------------------------------------------------------------
revoke all on judge_entries, judge_late_saves, judge_assignments, judge_scores, judge_ai_notes
  from anon;

revoke insert, update on judge_entries from authenticated;
grant insert (team_id, title, tagline, description_short, description_long,
              video_url, repo_url, links, checklist) on judge_entries to authenticated;
grant update (title, tagline, description_short, description_long,
              video_url, repo_url, links, checklist) on judge_entries to authenticated;

revoke insert, update on judge_late_saves from authenticated;
grant insert (team_id, payload) on judge_late_saves to authenticated;

revoke update on judge_scores from authenticated;
grant update (scores, comment) on judge_scores to authenticated;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table judge_entries     enable row level security;
alter table judge_late_saves  enable row level security;
alter table judge_assignments enable row level security;
alter table judge_scores      enable row level security;
alter table judge_ai_notes    enable row level security;

-- entries: team members, judges, admins read; members write before the deadline; admin all
create policy entries_read on judge_entries for select
  using (is_judge() or (team_id is not null and is_team_member(team_id)));
create policy entries_create on judge_entries for insert
  with check (team_id is not null and is_team_member(team_id)
              and judge_can_submit() and judge_submissions_open());
create policy entries_edit on judge_entries for update
  using (judge_can_edit_entry(id))
  with check (judge_can_edit_entry(id) and judge_submissions_open());
create policy entries_admin on judge_entries for all using (is_admin()) with check (is_admin());

-- late saves: the team and admins read; members insert their own; admin decides
create policy late_read on judge_late_saves for select
  using (saved_by = auth.uid() or is_team_member(team_id));
create policy late_create on judge_late_saves for insert
  with check (saved_by = auth.uid() and judge_can_submit() and is_team_member(team_id));
create policy late_admin on judge_late_saves for all using (is_admin()) with check (is_admin());

-- assignments: a judge reads their own; admin all
create policy assignments_read on judge_assignments for select
  using (judge_id = auth.uid() and is_judge());
create policy assignments_admin on judge_assignments for all using (is_admin()) with check (is_admin());

-- scores: a judge reads and writes their own; prelim only for assigned entries, final only
-- for finalists. Other judges' scores are read server-side through judge_entry_results.
create policy scores_read on judge_scores for select
  using (judge_id = auth.uid() and is_judge());
create policy scores_create on judge_scores for insert
  with check (judge_id = auth.uid() and is_judge()
              and ((round = 'prelim' and judge_is_assigned(entry_id))
                   or (round = 'final' and judge_is_finalist(entry_id))));
create policy scores_edit on judge_scores for update
  using (judge_id = auth.uid() and is_judge())
  with check (judge_id = auth.uid() and is_judge()
              and ((round = 'prelim' and judge_is_assigned(entry_id))
                   or (round = 'final' and judge_is_finalist(entry_id))));
create policy scores_admin on judge_scores for all using (is_admin()) with check (is_admin());

-- AI notes: judges read; written with the service role only
create policy ai_notes_read on judge_ai_notes for select using (is_judge());
