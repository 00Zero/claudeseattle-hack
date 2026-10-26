-- 20261026182737_shared_registration_setting.sql
-- Whether new people can create an account on the site (Admin -> Settings, lib/registration.ts).
-- 'auto' (and NULL): open until event_settings.event_ends_at, then closed. 'open' / 'closed': fixed.
-- Closed stops first sign-ins for Luma emails without an account (except guests checked in on
-- Luma, so attendees can still upload photos) and new sign-in requests. Existing accounts always
-- sign in.

alter table event_settings add column registration text check (registration in ('auto', 'open', 'closed'));
