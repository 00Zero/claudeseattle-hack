-- 20261025070907_shared_standby_checkins.sql
-- Standby check-in. Guests with a Luma "Standby" ticket stay pending on Luma, so Luma can't check
-- them in. They sign in here and check in at /check-in; admins see who is on site at
-- /admin/standby, approve some off the list (profiles.status_override, so re-imports keep it),
-- and approve the same people on Luma.
-- - standby_checkins: one row per person. checked_in_at is the first check-in (it sets the order
--   on the list); the location columns hold the latest attempt, so someone who allowed location on
--   a second try shows it. ip* come from the request (Vercel's IP geolocation, city-level); gps*
--   from the browser, only if the person allows it. venue_distance_m is from the GPS position to
--   event_settings.venue_lat/lon. Admin only: written by the server action (service role), so
--   there is no insert policy.
-- - event_settings.standby_can_see_teams: admin switch; NULL counts as off. When on, checked-in
--   standby guests see the team list (read-only, the public views) on /check-in.
-- - access_rules for the Standby ticket: own profile only while pending, full once approved.

create table standby_checkins (
  profile_id        uuid primary key references profiles (id) on delete cascade,
  checked_in_at     timestamptz not null default now(),
  last_attempt_at   timestamptz not null default now(),
  ip                text,
  user_agent        text,
  ip_city           text,
  ip_region         text,
  ip_country        text,
  ip_lat            double precision,
  ip_lon            double precision,
  gps_lat           double precision,
  gps_lon           double precision,
  gps_accuracy_m    double precision,
  gps_error         text check (gps_error in ('denied', 'unavailable', 'timeout', 'unsupported')),
  venue_distance_m  double precision,
  approved_at       timestamptz,
  approved_by       uuid references profiles (id) on delete set null
);

create index standby_checkins_order_idx on standby_checkins (checked_in_at);

alter table standby_checkins enable row level security;
create policy standby_checkins_admin on standby_checkins for all using (is_admin()) with check (is_admin());

alter table event_settings add column standby_can_see_teams boolean;

insert into access_rules (ticket_name, approval_status, access, default_role) values
  ('Standby', 'approved', 'full', 'participant'),
  ('Standby', 'pending_approval', 'profile_only', 'participant'),
  ('Standby', 'waitlist', 'profile_only', 'participant'),
  ('Standby', 'declined', 'blocked', 'participant')
on conflict (ticket_name, approval_status) do nothing;
