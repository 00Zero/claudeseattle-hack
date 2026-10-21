-- 20261021073547_shared_enrichment_sources.sql
-- LinkedIn enrichment from two providers. Owned by Adam. Changes require both devs' review.
-- Apify (harvestapi/linkedin-profile-scraper) is the main source; EnrichLayer validates it and
-- fills gaps. Rows are loaded by scripts/import-linkedin-enrichment.ts.
-- 1. linkedin_enrichment keeps one row per profile per source (was one per profile).
-- 2. linkedin_profiles: one merged row per profile. Each field comes from Apify, or from
--    EnrichLayer when Apify has nothing for it. matching_profiles reads this, with the same
--    column names as before.
-- 3. linkedin_enrichment_check (admin): both sources side by side, to spot disagreements.

-- ---------------------------------------------------------------
-- 1. One row per profile per source
-- ---------------------------------------------------------------
alter table linkedin_enrichment drop constraint linkedin_enrichment_pkey;
alter table linkedin_enrichment add primary key (linkedin_slug, source);
alter table linkedin_enrichment add constraint linkedin_enrichment_source_check
  check (source in ('apify', 'enrichlayer'));

-- ---------------------------------------------------------------
-- 2. Merged profile: Apify first, EnrichLayer for anything Apify lacks
-- ---------------------------------------------------------------
create view linkedin_profiles as
  select s.linkedin_slug,
         coalesce(nullif(a.headline, ''), l.headline) as headline,
         coalesce(nullif(a.summary, ''), l.summary) as summary,
         coalesce(nullif(a.current_title, ''), l.current_title) as current_title,
         coalesce(nullif(a.current_company, ''), l.current_company) as current_company,
         case when cardinality(a.skills) > 0 then a.skills else l.skills end as skills,
         case when jsonb_array_length(coalesce(a.experiences, '[]')) > 0 then a.experiences else l.experiences end as experiences,
         case when jsonb_array_length(coalesce(a.education, '[]')) > 0 then a.education else l.education end as education,
         array_remove(array[case when a.source is not null then 'apify' end,
                            case when l.source is not null then 'enrichlayer' end], null) as sources
  from (select distinct linkedin_slug from linkedin_enrichment) s
  left join linkedin_enrichment a on a.linkedin_slug = s.linkedin_slug and a.source = 'apify'
  left join linkedin_enrichment l on l.linkedin_slug = s.linkedin_slug and l.source = 'enrichlayer';
revoke all on linkedin_profiles from anon, authenticated;

-- ---------------------------------------------------------------
-- 3. Admin: compare the sources. Read with the service-role client.
-- ---------------------------------------------------------------
create view linkedin_enrichment_check as
  select s.linkedin_slug,
         a.fetched_at as apify_fetched_at,
         l.fetched_at as enrichlayer_fetched_at,
         lower(a.current_title) is not distinct from lower(l.current_title) as same_title,
         lower(a.current_company) is not distinct from lower(l.current_company) as same_company,
         coalesce(cardinality(a.skills), 0) as apify_skills,
         coalesce(cardinality(l.skills), 0) as enrichlayer_skills,
         jsonb_array_length(coalesce(a.experiences, '[]')) as apify_roles,
         jsonb_array_length(coalesce(l.experiences, '[]')) as enrichlayer_roles,
         exists (select 1 from luma_guests g where linkedin_slug(g.linkedin_url) = s.linkedin_slug) as is_guest
  from (select distinct linkedin_slug from linkedin_enrichment) s
  left join linkedin_enrichment a on a.linkedin_slug = s.linkedin_slug and a.source = 'apify'
  left join linkedin_enrichment l on l.linkedin_slug = s.linkedin_slug and l.source = 'enrichlayer';
revoke all on linkedin_enrichment_check from anon, authenticated;

-- ---------------------------------------------------------------
-- matching_profiles: same columns as 0006, LinkedIn fields from the merged profile.
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
  left join linkedin_profiles e
    on e.linkedin_slug = coalesce(linkedin_slug(p.linkedin_url), linkedin_slug(g.linkedin_url))
  left join latest a on a.guest_id = p.luma_guest_id and a.survey = 'attendee'
  left join latest b on b.guest_id = p.luma_guest_id and b.survey = 'small_business';
