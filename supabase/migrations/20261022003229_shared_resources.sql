-- 20261022003229_shared_resources.sql
-- Links for approved attendees on /resources: credits (Claude API, Tavily, Wispr Flow, ...),
-- the name tag form, the small business data folder. Admins manage them in /admin/settings.
-- Owned by Adam. Changes require both devs' review.
-- Every link is the same for everyone. Per-person codes, if a sponsor needs them, would be a
-- separate table assigned per profile.
-- event_settings.business_insights_url is no longer used: that link is a row here now, so it
-- shows only to approved attendees instead of on the public home page.

create table resources (
  id           uuid primary key default gen_random_uuid(),
  section      text not null check (section in ('credits', 'event', 'building')),
  title        text not null check (length(title) between 1 and 120),
  description  text,
  url          text not null check (url ~ '^https://'),
  sort_order   integer not null default 0,
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger resources_updated before update on resources for each row execute function set_updated_at();

alter table resources enable row level security;
-- Approved attendees (full access, any role) read visible links; admins manage all of them.
create policy resources_read  on resources for select using (visible and can_browse());
create policy resources_admin on resources for all using (is_admin()) with check (is_admin());
revoke all on resources from anon;
