-- 0004_shared_event_details.sql
-- Event details the home page shows, moved out of lib/event.ts and env so an admin can edit them
-- at /admin/settings and the site can be reused for the next event. All nullable: the home page
-- falls back to the lib/event.ts constants for any column left NULL.
-- - Wi-Fi is left NULL here because the repo is public; the admin enters it in the UI. The home
--   page only fetches it when someone clicks to reveal it, which keeps it out of the page HTML.
--   Like the rest of this row it is readable with the public anon key, so treat it as shared
--   with every attendee, not as a secret.
-- - event_starts_at / event_ends_at bound the home page "context window" countdown.
-- RLS is unchanged: everyone reads (settings_read), admin updates (settings_admin).

alter table event_settings
  add column venue_name          text,
  add column venue_address       text,
  add column venue_neighborhood  text,
  add column venue_lat           double precision,
  add column venue_lon           double precision,
  add column wifi_network        text,
  add column wifi_password       text,
  add column luma_calendar_url   text,
  add column event_starts_at     timestamptz,
  add column event_ends_at       timestamptz;

update event_settings set
  venue_name         = 'thinkspace Seattle',
  venue_address      = '1700 Westlake Ave N #200, Seattle',
  venue_neighborhood = 'South Lake Union',
  venue_lat          = 47.6341,
  venue_lon          = -122.3401,
  luma_calendar_url  = 'https://luma.com/AdamBurgh',
  event_starts_at    = '2026-10-24 16:30-07',
  event_ends_at      = '2026-10-25 19:30-07'
where id = 1;
