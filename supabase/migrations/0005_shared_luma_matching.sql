-- 0005_shared_luma_matching.sql
-- Luma data for profiles and team matching. Owned by Adam. Changes require both devs' review.
-- Which Luma columns go where is in docs/REQUIREMENTS.md, "Luma data: what goes where".
-- 1. Access rules for the 'Participant' ticket (Luma renamed 'Standard'), copied from 'Standard'.
-- 2. Claude-account emails from Luma are self-reported, so they no longer sign in by themselves:
--    they link a guest only when unambiguous and are attached to the profile unverified. The
--    owner verifies one from /profile to sign in with it. The Luma email stays pre-verified.
-- 3. linkedin_enrichment: LinkedIn data from an enrichment provider, keyed by profile slug. Admin only.
-- 4. matching_profiles: the signals team matching may use. Service role only, server-side only.

-- ---------------------------------------------------------------
-- 1. Participant ticket
-- ---------------------------------------------------------------
insert into access_rules (ticket_name, approval_status, access, default_role)
select 'Participant', approval_status, access, default_role
  from access_rules where ticket_name = 'Standard'
on conflict do nothing;

-- ---------------------------------------------------------------
-- 2. Claude-account emails
-- ---------------------------------------------------------------
-- The guest a Claude-account email identifies: exactly one guest listed it, and it isn't
-- any guest's Luma email (that guest is matched by Luma email instead). Else null.
create or replace function luma_guest_for_claude_email(p_email text) returns text
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then min(guest_id) end
    from luma_guests
   where lower(claude_email) = lower(p_email)
  having not exists (select 1 from luma_guests where lower(email) = lower(p_email))
$$;

-- Login helper (service role): the Luma email to send a sign-in link to when someone types
-- a Claude-account email, so accounts start from the Luma email. Null if not applicable.
create or replace function luma_email_for_claude_email(p_email text) returns text
language sql stable security definer set search_path = public as $$
  select email from luma_guests
   where guest_id = luma_guest_for_claude_email(p_email) and lower(email) <> lower(p_email)
$$;

-- Attach an email to a profile without letting it sign in. No-op if the profile has it.
create or replace function attach_unverified_email(p_profile uuid, p_email text, p_source text) returns void
language sql security definer set search_path = public as $$
  insert into profile_emails (profile_id, email, verified, is_default, source)
  select p_profile, lower(p_email), false, false, p_source
   where nullif(trim(p_email), '') is not null
  on conflict (profile_id, email) do nothing
$$;

revoke execute on function luma_guest_for_claude_email(text)            from public, anon, authenticated;
revoke execute on function luma_email_for_claude_email(text)            from public, anon, authenticated;
revoke execute on function attach_unverified_email(uuid, text, text)    from public, anon, authenticated;

-- Same as 0001, except: a Claude-account email match must be unambiguous, and the
-- Claude-account email is attached unverified.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare g luma_guests%rowtype;
begin
  if exists (select 1 from profile_emails where lower(email) = lower(new.email) and verified) then
    raise exception 'This email is already linked to another account. Sign in at /login instead.'
      using errcode = 'unique_violation';
  end if;

  select * into g from luma_guests lg
   where (lower(lg.email) = lower(new.email) or lg.guest_id = luma_guest_for_claude_email(new.email))
     and not exists (select 1 from profiles p where p.luma_guest_id = lg.guest_id)
   order by (lower(lg.email) = lower(new.email)) desc limit 1;

  insert into profiles (id, luma_guest_id, first_name, last_name, role_bucket, is_technical,
                        job_title, company, linkedin_url, github_username, claude_code_level,
                        platform_role, luma_status, ticket_name, checked_in_at)
  values (new.id, g.guest_id, coalesce(g.first_name, ''), coalesce(g.last_name, ''),
          luma_role_bucket(g.professional_role), luma_is_technical(g.github_experience),
          g.job_title, g.company, g.linkedin_url, g.github_username, g.claude_code_level,
          case when g.guest_id is not null then default_role_for(g.ticket_name) else 'participant' end,
          coalesce(g.approval_status, 'pending_approval'), g.ticket_name, g.checked_in_at);

  if new.email is not null then
    insert into profile_emails (profile_id, email, verified, is_default, source)
    values (new.id, lower(new.email), true, true, 'user');
  end if;
  perform attach_verified_email(new.id, g.email, 'luma');
  perform attach_unverified_email(new.id, g.claude_email, 'claude');
  return new;
end $$;

-- Same as 0001, with the same two changes as handle_new_user.
create or replace function sync_profile_from_luma() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not exists (select 1 from profiles where luma_guest_id = new.guest_id) then
    select p.id into pid
      from profiles p
      join profile_emails pe on pe.profile_id = p.id and pe.verified
     where p.luma_guest_id is null
       and (lower(pe.email) = lower(new.email)
            or (lower(pe.email) = lower(new.claude_email)
                and luma_guest_for_claude_email(new.claude_email) = new.guest_id))
     order by (lower(pe.email) = lower(new.email)) desc
     limit 1;

    if pid is not null then
      update profiles
         set luma_guest_id = new.guest_id,
             platform_role = case when platform_role = 'participant'
                                  then default_role_for(new.ticket_name) else platform_role end
       where id = pid;

      update profiles
         set first_name        = coalesce(nullif(new.first_name, ''), first_name),
             last_name         = coalesce(nullif(new.last_name, ''), last_name),
             role_bucket       = coalesce(luma_role_bucket(new.professional_role), role_bucket),
             is_technical      = coalesce(luma_is_technical(new.github_experience), is_technical),
             job_title         = coalesce(new.job_title, job_title),
             company           = coalesce(new.company, company),
             linkedin_url      = coalesce(new.linkedin_url, linkedin_url),
             github_username   = coalesce(new.github_username, github_username),
             claude_code_level = coalesce(new.claude_code_level, claude_code_level)
       where id = pid and not profile_confirmed;

      perform attach_verified_email(pid, new.email, 'luma');
      perform attach_unverified_email(pid, new.claude_email, 'claude');
    end if;
  end if;

  update profiles
     set luma_status   = coalesce(status_override, new.approval_status),
         ticket_name   = new.ticket_name,
         checked_in_at = new.checked_in_at
   where luma_guest_id = new.guest_id;
  return new;
end $$;

-- ---------------------------------------------------------------
-- 3. LinkedIn enrichment
-- ---------------------------------------------------------------
-- "https://www.linkedin.com/in/Jane-Doe/?x=1" -> "jane-doe". Null if not a profile link.
create or replace function linkedin_slug(p_url text) returns text
language sql immutable set search_path = public as $$
  select nullif(lower(substring(p_url from '(?i)linkedin\.com/(?:in|pub)/([^/?#[:space:]]+)')), '')
$$;

-- One row per LinkedIn profile, from whichever provider fetched it last. Joined to people by
-- linkedin_slug(profiles.linkedin_url), falling back to the Luma answer. Extracted columns
-- feed matching_profiles; raw keeps the provider payload (may hold contact details) for
-- re-extraction and is never shown or sent to a model.
create table linkedin_enrichment (
  linkedin_slug    text primary key check (linkedin_slug = lower(linkedin_slug)),
  source           text not null,                  -- provider, e.g. 'enrichlayer', 'apify'
  fetched_at       timestamptz not null default now(),
  headline         text,
  summary          text,
  current_title    text,
  current_company  text,
  skills           text[],
  experiences      jsonb,                          -- [{title, company, starts_at, ends_at, description}]
  education        jsonb,                          -- [{school, degree, field}]
  raw              jsonb not null
);
alter table linkedin_enrichment enable row level security;
create policy enrichment_admin on linkedin_enrichment for all using (is_admin()) with check (is_admin());
revoke all on linkedin_enrichment from anon;

-- ---------------------------------------------------------------
-- 4. Matching signals
-- ---------------------------------------------------------------
-- Everything team matching may use about a person, one row per profile. Read only with the
-- service-role client in server code (lib/matching.ts), after checking the caller can browse.
-- Results shown to people are derived (a score, a reason, a blurb), never these raw answers.
-- No emails, names beyond display_name, Luma status details, or raw enrichment.
create view matching_profiles as
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
         e.education as linkedin_education
  from profiles p
  left join luma_guests g on g.guest_id = p.luma_guest_id
  left join linkedin_enrichment e
    on e.linkedin_slug = coalesce(linkedin_slug(p.linkedin_url), linkedin_slug(g.linkedin_url));
revoke all on matching_profiles from anon, authenticated;
comment on view matching_profiles is
  'Team matching signals. Service role only, server-side only; never return raw rows to the browser. Runs as owner on purpose.';
