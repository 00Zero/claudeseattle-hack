-- 20261025183335_shared_banners.sql
-- Announcement banners shown below the site header on every page (lunch is served, a deadline is
-- coming, a room changed). Admins write and schedule them in /admin/banners.
-- Owned by Adam. Changes require both devs' review.
-- - A banner shows while starts_at <= now() < ends_at. Several can be live at once.
-- - Everyone, signed out included, reads live banners. Scheduled and past ones stay hidden until
--   (and after) their window, so a planned announcement doesn't leak early. Admins read and write
--   all of them with the service-role client after a server-side admin check.
-- - tone: 'info' for routine notices, 'urgent' for changes people must not miss.

create table banners (
  id          uuid primary key default gen_random_uuid(),
  message     text not null check (length(message) between 1 and 500),
  tone        text not null default 'info' check (tone in ('info', 'urgent')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create trigger banners_updated before update on banners for each row execute function set_updated_at();
create index banners_window_idx on banners (starts_at, ends_at);

alter table banners enable row level security;
create policy banners_read_live on banners for select using (starts_at <= now() and ends_at > now());
create policy banners_admin on banners for all using (is_admin()) with check (is_admin());
revoke all on banners from anon, authenticated;
grant select on banners to anon, authenticated;
