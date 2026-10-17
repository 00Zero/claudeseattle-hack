-- 0001_shared.sql
-- Shared foundation for hack.claudeseattle.org
-- Owned by Adam. Changes require both devs' review.
-- Dev-owned tables use prefixes: teams_* (Dev A), judge_* (Dev B).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------
create type role_bucket as enum ('owner', 'professional', 'student');
create type luma_status as enum ('approved', 'pending_approval', 'waitlist', 'declined');
create type platform_role as enum ('participant', 'mentor', 'volunteer', 'judge', 'admin');
create type member_status as enum ('applied', 'member', 'rejected', 'removed', 'left');
-- full: browse profiles and teams. profile_only: own profile and the pending page. blocked: declined page.
create type access_level as enum ('full', 'profile_only', 'blocked');

-- ---------------------------------------------------------------
-- Raw Luma import (admin uploads the guests CSV; upsert on guest_id)
-- ---------------------------------------------------------------
create table luma_guests (
  guest_id            text primary key,
  name                text,
  first_name          text,
  last_name           text,
  email               text not null,
  claude_email        text,
  approval_status     luma_status not null,
  ticket_name         text,
  checked_in_at       timestamptz,
  linkedin_url        text,
  github_username     text,
  professional_role   text,
  company             text,
  job_title           text,
  employee_count      text,
  claude_code_level   text,
  github_experience   text,
  why_join            text,
  features_interest   text,
  portfolio_url       text,
  imported_at         timestamptz not null default now()
);
create index on luma_guests (lower(email));
create index on luma_guests (lower(claude_email));
create index on luma_guests (linkedin_url);

-- ---------------------------------------------------------------
-- Access rules: admin-editable mapping from Luma ticket + approval status
-- to access level and starting platform_role.
-- ticket_name is exactly as Luma exports it; '' = no ticket (declined
-- guests, people not in Luma). A pair with no rule falls back to
-- profile_only (blocked if declined) and shows in unmapped_luma_tickets.
-- default_role is read from the ticket's 'approved' row; the admin page
-- edits it per ticket.
-- ---------------------------------------------------------------
create table access_rules (
  ticket_name      text not null,
  approval_status  luma_status not null,
  access           access_level not null,
  default_role     platform_role not null default 'participant',
  primary key (ticket_name, approval_status)
);
insert into access_rules (ticket_name, approval_status, access, default_role)
select t.ticket_name, s.status,
       case s.status when 'approved' then 'full' when 'declined' then 'blocked' else 'profile_only' end::access_level,
       t.default_role
from (values ('Standard',   'participant'::platform_role),
             ('Mentor',     'mentor'),
             ('Ambassador', 'mentor'),
             ('Volunteer',  'volunteer'),
             ('Judge',      'judge'),
             ('',           'participant')) t (ticket_name, default_role)
cross join unnest(enum_range(null::luma_status)) s (status);

-- ---------------------------------------------------------------
-- Profiles: one per person. id = auth.users.id
-- ---------------------------------------------------------------
create table profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  luma_guest_id       text unique references luma_guests (guest_id),
  first_name          text not null,
  last_name           text not null,
  display_name        text generated always as (
                        case when first_name = '' then 'Guest'
                             when last_name = '' then first_name
                             else first_name || ' ' || left(last_name, 1) || '.' end) stored,
  role_bucket         role_bucket,
  is_technical        boolean,
  job_title           text,
  company             text,
  linkedin_url        text,
  github_username     text,
  claude_code_level   text,
  bio                 text,
  looking_for         text,
  platform_role       platform_role not null default 'participant',
  luma_status         luma_status,          -- effective: coalesce(status_override, Luma approval_status)
  status_override     luma_status,          -- set only by admins (approve/decline); survives re-imports
  ticket_name         text,                 -- as Luma exports it; null = not in Luma
  checked_in_at       timestamptz,
  profile_confirmed   boolean not null default false,
  public_profile      boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Several emails per person; any verified one can log in; one is default for platform mail.
-- An email is owned by at most one profile once verified; unverified duplicates are allowed.
create table profile_emails (
  profile_id         uuid not null references profiles (id) on delete cascade,
  email              text not null,
  verified           boolean not null default false,
  is_default         boolean not null default false,
  source             text not null default 'user',   -- 'luma' | 'claude' | 'user'
  verify_token_hash  text,                           -- sha256 of the add-email token
  verify_expires_at  timestamptz,
  primary key (profile_id, email)
);
create unique index on profile_emails (lower(email)) where verified;
create unique index on profile_emails (profile_id) where is_default;
create unique index on profile_emails (verify_token_hash) where verify_token_hash is not null;

-- ---------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------
create table teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  concept      text,
  looking_for  text,
  leader_id    uuid not null references profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table team_members (
  team_id      uuid not null references teams (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  status       member_status not null default 'applied',
  applied_at   timestamptz not null default now(),
  joined_at    timestamptz,
  primary key (team_id, profile_id)
);
-- One active team per person (status = member).
create unique index one_team_per_person on team_members (profile_id) where status = 'member';

-- ---------------------------------------------------------------
-- Event settings (deadlines, publish toggles). One row.
-- ---------------------------------------------------------------
create table event_settings (
  id                        int primary key default 1 check (id = 1),
  team_formation_closes_at  timestamptz not null default '2026-10-25 10:30-07',
  submissions_close_at      timestamptz not null default '2026-10-25 17:30-07',
  publish_finalists         boolean not null default false,
  publish_winners           boolean not null default false
);
insert into event_settings default values;

-- ---------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------
create or replace function current_profile_role() returns platform_role
language sql stable security definer set search_path = public as $$
  select platform_role from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_profile_role() = 'admin', false)
$$;

-- Access for a ticket + status pair. Unmapped pairs: blocked if declined, else profile_only.
create or replace function access_for(p_ticket text, p_status luma_status) returns access_level
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select access from access_rules
      where ticket_name = coalesce(p_ticket, '') and approval_status = p_status),
    case when p_status = 'declined' then 'blocked' else 'profile_only' end::access_level)
$$;

-- Starting platform_role for a ticket (from its 'approved' rule); participant if unmapped.
create or replace function default_role_for(p_ticket text) returns platform_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select default_role from access_rules where ticket_name = coalesce(p_ticket, '')
      order by (approval_status = 'approved') desc limit 1),
    'participant')
$$;

-- The logged-in user's access level. Admins are always full. Null if no profile.
create or replace function current_access() returns access_level
language sql stable security definer set search_path = public as $$
  select case when platform_role = 'admin' then 'full'::access_level
              else access_for(ticket_name, luma_status) end
    from profiles where id = auth.uid()
$$;

-- Full access (any role): may browse profiles and teams.
create or replace function can_browse() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_access() = 'full', false)
$$;

-- Full access as participant, mentor, or admin: may create/join teams.
create or replace function can_join_teams() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_access() = 'full'
                  and current_profile_role() in ('participant', 'mentor', 'admin'), false)
$$;

create or replace function is_judge() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_profile_role() in ('judge', 'admin'), false)
$$;

create or replace function is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members
                  where team_id = p_team and profile_id = auth.uid() and status = 'member')
$$;

create or replace function is_team_leader(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teams where id = p_team and leader_id = auth.uid())
$$;

-- Luma answer -> role bucket. Blank stays null so the user picks on first login.
create or replace function luma_role_bucket(p_role text) returns role_bucket
language sql immutable as $$
  select case
    when p_role in ('Startup founder', 'Small business owner', 'Small business executive') then 'owner'::role_bucket
    when p_role in ('Current student', 'Recent grad (<3 years from graduation)') then 'student'::role_bucket
    when nullif(trim(p_role), '') is not null then 'professional'::role_bucket
  end
$$;

-- Luma GitHub experience -> technical flag (user confirms on first login). Blank stays null.
create or replace function luma_is_technical(p_exp text) returns boolean
language sql immutable as $$
  select case when nullif(trim(p_exp), '') is null then null
              else p_exp in ('Run a shared repo for a team (review PRs, resolve merge conflicts)',
                             'Contributed to shared repos (branches, pull requests)') end
$$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger teams_updated before update on teams for each row execute function set_updated_at();

-- Attach an email to a profile as verified, unless it is already verified elsewhere.
-- Flips an existing unverified row on the same profile. Never raises.
create or replace function attach_verified_email(p_profile uuid, p_email text, p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(p_email), '') is null then return; end if;
  if exists (select 1 from profile_emails where lower(email) = lower(p_email) and verified) then return; end if;
  insert into profile_emails (profile_id, email, verified, is_default, source)
  values (p_profile, lower(p_email), true, false, p_source)
  on conflict (profile_id, email) do update
    set verified = true, verify_token_hash = null, verify_expires_at = null;
exception when unique_violation then
  null;  -- lost a race to another profile; leave it there
end $$;
revoke execute on function attach_verified_email(uuid, text, text) from public, anon, authenticated;

-- On first login: create profile from the unlinked Luma row matching the email.
-- Never fails signup, except when the email is already verified on another
-- profile (only reachable by bypassing /login, which redirects to the owner's auth email).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare g luma_guests%rowtype;
begin
  if exists (select 1 from profile_emails where lower(email) = lower(new.email) and verified) then
    raise exception 'This email is already linked to another account. Sign in at /login instead.'
      using errcode = 'unique_violation';
  end if;

  select * into g from luma_guests lg
   where (lower(lg.email) = lower(new.email) or lower(lg.claude_email) = lower(new.email))
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
  perform attach_verified_email(new.id, g.claude_email, 'claude');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Re-import sync, per upserted luma_guests row:
-- 1. Late link: a profile with no luma_guest_id and a verified email matching the
--    guest's email or claude_email gets linked (Luma email match preferred). Seeded
--    fields are filled only if profile_confirmed is false; platform_role only if
--    still 'participant'; the guest's emails are attached as verified.
-- 2. Refresh status, ticket, and check-in on the linked profile. An admin's
--    status_override always wins, so re-imports never undo a manual approve/decline.
--    platform_role is never touched by re-imports.
create or replace function sync_profile_from_luma() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not exists (select 1 from profiles where luma_guest_id = new.guest_id) then
    select p.id into pid
      from profiles p
      join profile_emails pe on pe.profile_id = p.id and pe.verified
     where p.luma_guest_id is null
       and lower(pe.email) in (lower(new.email), lower(new.claude_email))
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
      perform attach_verified_email(pid, new.claude_email, 'claude');
    end if;
  end if;

  update profiles
     set luma_status   = coalesce(status_override, new.approval_status),
         ticket_name   = new.ticket_name,
         checked_in_at = new.checked_in_at
   where luma_guest_id = new.guest_id;
  return new;
end $$;
create trigger luma_guests_sync after insert or update on luma_guests
  for each row execute function sync_profile_from_luma();

-- New team: the leader becomes its first member.
create or replace function add_leader_as_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into team_members (team_id, profile_id, status, joined_at)
  values (new.id, new.leader_id, 'member', now());
  return new;
end $$;
create trigger teams_add_leader after insert on teams
  for each row execute function add_leader_as_member();

-- ---------------------------------------------------------------
-- Public view: what the world sees without logging in.
-- Members as "First L." unless they opted in. No emails, links, company, scores.
-- ---------------------------------------------------------------
create view public_teams as
  select t.id, t.name, t.concept, t.created_at
  from teams t;

create view public_team_members as
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
  where tm.status = 'member';

grant select on public_teams, public_team_members, event_settings to anon, authenticated;

-- Leader's current default email, for "contact the team". Logged-in users with full access only.
create view team_leader_contacts as
  select t.id as team_id, pe.email as leader_email
  from teams t
  join profile_emails pe on pe.profile_id = t.leader_id and pe.is_default
  where can_browse();
revoke all on team_leader_contacts from anon;
grant select on team_leader_contacts to authenticated;

-- Admin: Luma ticket + status pairs with no access rule. Read with the service-role client.
create view unmapped_luma_tickets as
  select coalesce(g.ticket_name, '') as ticket_name, g.approval_status, count(*) as guests
  from luma_guests g
  left join access_rules r
    on r.ticket_name = coalesce(g.ticket_name, '') and r.approval_status = g.approval_status
  where r.ticket_name is null
  group by 1, 2;
revoke all on unmapped_luma_tickets from anon, authenticated;

-- ---------------------------------------------------------------
-- Column privileges
-- ---------------------------------------------------------------
-- profiles: users edit only their own self-service fields. Status, role, ticket,
-- Luma link, and override are written by triggers or admin server actions (service role).
revoke update on profiles from anon, authenticated;
grant update (first_name, last_name, role_bucket, is_technical, job_title, company,
              linkedin_url, github_username, claude_code_level, bio, looking_for,
              profile_confirmed, public_profile) on profiles to authenticated;

-- profile_emails: users read their own rows; all writes go through server actions (service role).
revoke insert, update, delete on profile_emails from anon, authenticated;

-- team_members: only status and joined_at change after insert (team and person are fixed).
revoke update on team_members from anon, authenticated;
grant update (status, joined_at) on team_members to authenticated;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table luma_guests    enable row level security;
alter table access_rules   enable row level security;
alter table profiles       enable row level security;
alter table profile_emails enable row level security;
alter table teams          enable row level security;
alter table team_members   enable row level security;
alter table event_settings enable row level security;

-- luma_guests, access_rules: admin only (admin pages use the service role after an admin check)
create policy luma_admin  on luma_guests  for all using (is_admin()) with check (is_admin());
create policy rules_admin on access_rules for all using (is_admin()) with check (is_admin());

-- profiles: own row read/write (column grants limit what); full-access users read all; admin all
create policy profiles_self_read  on profiles for select using (id = auth.uid());
create policy profiles_self_write on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_browse     on profiles for select using (can_browse());
create policy profiles_admin      on profiles for all using (is_admin()) with check (is_admin());

-- profile_emails: own rows, read only; admin reads all
create policy emails_self  on profile_emails for select using (profile_id = auth.uid());
create policy emails_admin on profile_emails for select using (is_admin());

-- teams: full-access users read; eligible users create; leader edits; admin all
create policy teams_read   on teams for select using (can_browse());
create policy teams_create on teams for insert with check (can_join_teams() and leader_id = auth.uid());
create policy teams_leader on teams for update using (leader_id = auth.uid()) with check (leader_id = auth.uid());
create policy teams_admin  on teams for all using (is_admin()) with check (is_admin());

-- team_members: full-access users read; eligible users apply for themselves;
-- leader accepts/rejects/removes on their team; self can leave; admin all
create policy members_read  on team_members for select using (can_browse());
create policy members_apply on team_members for insert
  with check (can_join_teams() and profile_id = auth.uid() and status = 'applied');
create policy members_leader on team_members for update
  using (is_team_leader(team_id))
  with check (status in ('member','rejected','removed'));
create policy members_leave on team_members for update
  using (profile_id = auth.uid()) with check (status = 'left');
create policy members_admin on team_members for all using (is_admin()) with check (is_admin());

-- event_settings: everyone reads (granted above); admin writes
create policy settings_read  on event_settings for select using (true);
create policy settings_admin on event_settings for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------
-- Seed admin (runs after Adam's first login creates his profile)
-- ---------------------------------------------------------------
-- update profiles set platform_role = 'admin', luma_status = 'approved', status_override = 'approved'
--  where id = (select id from auth.users where email = '<YOUR_EMAIL>');
