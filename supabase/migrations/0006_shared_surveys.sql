-- 0006_shared_surveys.sql
-- Survey data for team matching. Owned by Adam. Changes require both devs' review.
-- Two Google Forms feed survey_responses through /api/surveys/sync (an Apps Script in each
-- response sheet posts every row; see scripts/apps-script/survey-sync.gs):
-- - attendee: the hackathon attendee survey. Matching only, for everyone who answered.
-- - small_business: the small business AI survey. Matching only for owners who also
--   registered for the hackathon; everyone's answers, scrubbed, feed the public dataset
--   (scripts/export-business-insights.ts). Revenue and the respondent's name are never stored.
-- Neither is shown on profiles or anywhere else in the UI. Tiers are in docs/REQUIREMENTS.md,
-- "Luma data: what goes where".
-- 1. survey_responses + replace_survey_responses() (each sync replaces a survey's rows).
-- 2. survey_guest(): response -> Luma guest by Luma email, then Claude-account email, then a
--    unique LinkedIn profile. Computed on read, so a later Luma import links new guests.
-- 3. matching_profiles gains attendee_survey and business_survey.
-- 4. event_settings.business_insights_url: the public folder the home page links to.

-- ---------------------------------------------------------------
-- 1. Responses
-- ---------------------------------------------------------------
create table survey_responses (
  survey        text not null check (survey in ('attendee', 'small_business')),
  response_key  text not null,                     -- sha256 of survey, timestamp, email
  submitted_at  timestamptz,
  email         text check (email = lower(email)),
  linkedin_url  text,
  contact       jsonb not null default '{}',       -- business name, website, follow-up answer; admin only
  answers       jsonb not null,                    -- question key -> answer; see lib/surveys.ts
  synced_at     timestamptz not null default now(),
  primary key (survey, response_key)
);
alter table survey_responses enable row level security;
create policy surveys_admin on survey_responses for all using (is_admin()) with check (is_admin());
revoke all on survey_responses from anon;

-- Replace one survey's rows with p_rows (a JSON array of rows with unique response_key)
-- in one transaction, so edits and deletions in the sheet carry over. Service role only.
create or replace function replace_survey_responses(p_survey text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows: refusing to empty survey %', p_survey;
  end if;
  delete from survey_responses where survey = p_survey;
  insert into survey_responses (survey, response_key, submitted_at, email, linkedin_url, contact, answers)
  select p_survey, r->>'response_key', (r->>'submitted_at')::timestamptz,
         lower(nullif(r->>'email', '')), nullif(r->>'linkedin_url', ''),
         coalesce(r->'contact', '{}'), r->'answers'
    from jsonb_array_elements(p_rows) r;
  return jsonb_array_length(p_rows);
end $$;
revoke execute on function replace_survey_responses(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 2. Response -> Luma guest
-- ---------------------------------------------------------------
-- Luma email first; then a Claude-account email that identifies one guest; then a LinkedIn
-- profile exactly one guest gave. Null guest_id when none matches.
create or replace function survey_guest(p_email text, p_linkedin text, out guest_id text, out matched_via text)
language plpgsql stable security definer set search_path = public as $$
begin
  select g.guest_id into guest_id from luma_guests g where lower(g.email) = lower(p_email) limit 1;
  if guest_id is not null then matched_via := 'luma'; return; end if;

  guest_id := luma_guest_for_claude_email(p_email);
  if guest_id is not null then matched_via := 'claude'; return; end if;

  select min(g.guest_id) into guest_id from luma_guests g
   where linkedin_slug(g.linkedin_url) = linkedin_slug(p_linkedin)
  having count(*) = 1;
  if guest_id is not null then matched_via := 'linkedin'; end if;
end $$;
revoke execute on function survey_guest(text, text) from public, anon, authenticated;

-- Admin: which guest each response belongs to. Read with the service-role client.
create view survey_matches as
  select r.survey, r.response_key, r.submitted_at, m.guest_id, m.matched_via
  from survey_responses r
  cross join lateral survey_guest(r.email, r.linkedin_url) m;
revoke all on survey_matches from anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Matching signals: same columns as 0005, plus each person's latest survey answers.
-- Business answers only count for owners and staff, not the survey's "Neither" screen-out.
-- ---------------------------------------------------------------
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
         b.answers as business_survey
  from profiles p
  left join luma_guests g on g.guest_id = p.luma_guest_id
  left join linkedin_enrichment e
    on e.linkedin_slug = coalesce(linkedin_slug(p.linkedin_url), linkedin_slug(g.linkedin_url))
  left join latest a on a.guest_id = p.luma_guest_id and a.survey = 'attendee'
  left join latest b on b.guest_id = p.luma_guest_id and b.survey = 'small_business';

-- ---------------------------------------------------------------
-- 4. Public business insights link
-- ---------------------------------------------------------------
alter table event_settings add column business_insights_url text;
