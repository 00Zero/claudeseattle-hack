-- 20261021075506_shared_enrichment_check_blank.sql
-- linkedin_enrichment_check: same_title and same_company are null unless both sources have
-- the profile. Before, a profile with one source compared null to null and read as agreeing.
-- Owned by Adam. Changes require both devs' review.

create or replace view linkedin_enrichment_check as
  select s.linkedin_slug,
         a.fetched_at as apify_fetched_at,
         l.fetched_at as enrichlayer_fetched_at,
         case when a.source is not null and l.source is not null
              then lower(a.current_title) is not distinct from lower(l.current_title) end as same_title,
         case when a.source is not null and l.source is not null
              then lower(a.current_company) is not distinct from lower(l.current_company) end as same_company,
         coalesce(cardinality(a.skills), 0) as apify_skills,
         coalesce(cardinality(l.skills), 0) as enrichlayer_skills,
         jsonb_array_length(coalesce(a.experiences, '[]')) as apify_roles,
         jsonb_array_length(coalesce(l.experiences, '[]')) as enrichlayer_roles,
         exists (select 1 from luma_guests g where linkedin_slug(g.linkedin_url) = s.linkedin_slug) as is_guest
  from (select distinct linkedin_slug from linkedin_enrichment) s
  left join linkedin_enrichment a on a.linkedin_slug = s.linkedin_slug and a.source = 'apify'
  left join linkedin_enrichment l on l.linkedin_slug = s.linkedin_slug and l.source = 'enrichlayer';
