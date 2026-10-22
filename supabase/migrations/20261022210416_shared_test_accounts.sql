-- Test accounts: copies of real approved guests for simulating team formation
-- (/admin/test-accounts, scripts/test-accounts.ts, lib/test-accounts.ts).
--
-- A test account is an auth user with a test.<guest_id>@example.com email whose profile links
-- to a copy of the guest's luma_guests row (guest_id 'test_<guest_id>', last name "Test").
-- Test accounts live in their own world: real accounts, admins included, never see test
-- profiles, teams, members, invites, entries, assignments or scores, and test accounts never
-- see real ones. Test teams submit test entries that test judges score, with their own
-- finalists and places; public pages never show them. Admins see both worlds through the
-- service role (/admin/test-accounts, /admin/judging?world=test) and by signing in as a test
-- account.
--
-- The rule is added as restrictive policies, which Postgres ANDs with the existing permissive
-- ones, so no existing policy changes.

-- 1. The flag, derived from the Luma link (users can't change luma_guest_id).
alter table profiles
  add column is_test boolean generated always as (coalesce(starts_with(luma_guest_id, 'test_'), false)) stored;

-- 2. Helpers for the policies.
create or replace function viewer_is_test() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_test from profiles where id = auth.uid()), false)
$$;

create or replace function profile_is_test(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_test from profiles where id = p_profile), false)
$$;

-- A team belongs to its leader's world.
create or replace function team_is_test(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_test from teams t join profiles p on p.id = t.leader_id where t.id = p_team), false)
$$;

-- An entry belongs to its team's world; fallback entries (no team) are real.
create or replace function entry_is_test(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select team_is_test(team_id) from judge_entries where id = p_entry), false)
$$;

revoke execute on function viewer_is_test(), profile_is_test(uuid), team_is_test(uuid), entry_is_test(uuid)
  from public, anon;
grant execute on function viewer_is_test(), profile_is_test(uuid), team_is_test(uuid), entry_is_test(uuid)
  to authenticated;

-- 3. Same world only. Anonymous visitors have no permissive policies on these tables, and the
-- service role bypasses RLS, so only authenticated users need the rule.
create policy profiles_same_world on profiles as restrictive for all to authenticated
  using (is_test = (select viewer_is_test()))
  with check (is_test = (select viewer_is_test()));

create policy teams_same_world on teams as restrictive for all to authenticated
  using (profile_is_test(leader_id) = (select viewer_is_test()))
  with check (profile_is_test(leader_id) = (select viewer_is_test()));

create policy members_same_world on team_members as restrictive for all to authenticated
  using (profile_is_test(profile_id) = (select viewer_is_test())
         and team_is_test(team_id) = (select viewer_is_test()))
  with check (profile_is_test(profile_id) = (select viewer_is_test())
              and team_is_test(team_id) = (select viewer_is_test()));

create policy teams_invites_same_world on teams_invites as restrictive for all to authenticated
  using (profile_is_test(profile_id) = (select viewer_is_test())
         and team_is_test(team_id) = (select viewer_is_test()))
  with check (profile_is_test(profile_id) = (select viewer_is_test())
              and team_is_test(team_id) = (select viewer_is_test()));

create policy entries_same_world on judge_entries as restrictive for all to authenticated
  using (team_is_test(team_id) = (select viewer_is_test()))
  with check (team_is_test(team_id) = (select viewer_is_test()));

create policy late_saves_same_world on judge_late_saves as restrictive for all to authenticated
  using (team_is_test(team_id) = (select viewer_is_test()))
  with check (team_is_test(team_id) = (select viewer_is_test()));

create policy assignments_same_world on judge_assignments as restrictive for all to authenticated
  using (profile_is_test(judge_id) = (select viewer_is_test())
         and entry_is_test(entry_id) = (select viewer_is_test()))
  with check (profile_is_test(judge_id) = (select viewer_is_test())
              and entry_is_test(entry_id) = (select viewer_is_test()));

create policy scores_same_world on judge_scores as restrictive for all to authenticated
  using (profile_is_test(judge_id) = (select viewer_is_test())
         and entry_is_test(entry_id) = (select viewer_is_test()))
  with check (profile_is_test(judge_id) = (select viewer_is_test())
              and entry_is_test(entry_id) = (select viewer_is_test()));

create policy ai_notes_same_world on judge_ai_notes as restrictive for all to authenticated
  using (entry_is_test(entry_id) = (select viewer_is_test()));

-- 4. Views run as their owner and skip RLS, so they filter test rows themselves.
-- Public team views: same columns as 0001, without test teams or test people.
create or replace view public_teams as
  select t.id, t.name, t.concept, t.created_at
  from teams t
  join profiles l on l.id = t.leader_id
  where not l.is_test;

create or replace view public_team_members as
  select tm.team_id,
         p.display_name,
         case when p.public_profile then p.first_name || ' ' || p.last_name end as full_name,
         case when p.public_profile then p.job_title end as job_title,
         case when p.public_profile then p.company end as company,
         case when p.public_profile then p.linkedin_url end as linkedin_url,
         p.role_bucket, p.is_technical,
         (p.platform_role = 'mentor') as is_mentor,
         (t.leader_id = p.id) as is_leader
  from team_members tm
  join profiles p on p.id = tm.profile_id
  join teams t on t.id = tm.team_id
  join profiles l on l.id = t.leader_id
  where tm.status = 'member' and not p.is_test and not l.is_test;

-- matching_profiles: same as 20261021073547, plus is_test at the end (lib/matching.ts keeps
-- each caller to their own world), and test accounts take survey answers from the guest they
-- copy, since survey rows are replaced on every sync.
create or replace view matching_profiles as
  with latest as (
    select distinct on (m.guest_id, r.survey) m.guest_id, r.survey, r.answers
      from survey_responses r
      cross join lateral survey_guest(r.email, r.linkedin_url) m
     where m.guest_id is not null
       and (r.survey = 'attendee' or r.answers->>'business_role' is distinct from 'Neither')
     order by m.guest_id, r.survey, r.submitted_at desc nulls last
  )
  select p.id as profile_id,
         case when p.platform_role = 'admin' then 'full'::access_level
              else access_for(p.ticket_name, p.luma_status) end as access,
         p.display_name, p.platform_role, p.role_bucket, p.is_technical, p.claude_code_level,
         p.job_title, p.company, p.bio, p.interests, p.looking_for,
         g.professional_role, g.employee_count, g.github_experience,
         g.why_join, g.features_interest, g.portfolio_url,
         e.headline as linkedin_headline, e.summary as linkedin_summary,
         e.current_title as linkedin_title, e.current_company as linkedin_company,
         e.skills as linkedin_skills, e.experiences as linkedin_experiences,
         e.education as linkedin_education,
         a.answers as attendee_survey,
         b.answers as business_survey,
         p.is_test
  from profiles p
  left join luma_guests g on g.guest_id = p.luma_guest_id
  left join linkedin_profiles e
    on e.linkedin_slug = coalesce(linkedin_slug(p.linkedin_url), linkedin_slug(g.linkedin_url))
  left join latest a on a.guest_id = regexp_replace(p.luma_guest_id, '^test_', '') and a.survey = 'attendee'
  left join latest b on b.guest_id = regexp_replace(p.luma_guest_id, '^test_', '') and b.survey = 'small_business';

-- 5. Judging results, kept apart by world.
-- judge_entry_results: same as judge_core, plus is_test at the end, and places ranked within
-- each world so test finalists never take a real place. Finalists are per judge group, and
-- admins assign test entries only to test judges, so groups don't mix.
create or replace view judge_entry_results as
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

-- The final round and its standings: the caller's own world only.
create or replace function judge_finalists()
returns table (entry_id uuid, team_name text, title text)
language sql stable security definer set search_path = public as $$
  select r.entry_id, r.team_name, r.title
    from judge_entry_results r
   where r.is_finalist and is_judge() and r.is_test = viewer_is_test()
   order by r.team_name
$$;

create or replace function judge_final_standings()
returns table (entry_id uuid, team_name text, title text, final_score numeric, final_votes bigint, place bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_judge() then
    return;
  end if;
  if exists (
    select 1 from judge_entry_results r
     where r.is_finalist and r.is_test = viewer_is_test()
       and not exists (select 1 from judge_scores s
                        where s.entry_id = r.entry_id and s.judge_id = auth.uid() and s.round = 'final')
  ) then
    return;
  end if;
  return query
    select r.entry_id, r.team_name, r.title, r.final_score, r.final_votes, r.place
      from judge_entry_results r
     where r.is_finalist and r.is_test = viewer_is_test()
     order by r.final_score desc nulls last, r.team_name;
end $$;

-- Public entry pages and results: same columns as judge_core, without test entries.
create or replace view public_judge_entries as
  select e.id, e.team_id, coalesce(t.name, e.fallback_team_name) as team_name,
         e.title, e.tagline, e.description_short, e.description_long,
         e.video_url, e.repo_url, e.links
  from judge_entries e
  left join teams t on t.id = e.team_id
  left join profiles l on l.id = t.leader_id
  where e.last_saved_at is not null
    and not coalesce(l.is_test, false)
    and now() >= (select submissions_close_at from event_settings where id = 1);

create or replace view public_judge_results as
  select r.entry_id, r.team_id, r.team_name, r.title,
         case when s.publish_winners then r.place end as place
  from judge_entry_results r
  cross join event_settings s
  where s.id = 1 and r.is_finalist and not r.is_test and (s.publish_finalists or s.publish_winners);
