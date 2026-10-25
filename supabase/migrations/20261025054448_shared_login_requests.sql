-- 20261025054448_shared_login_requests.sql
-- Sign-in requests. The login page sends a link only to an email that already has an account or
-- is a Luma registration email. Anyone else (a Claude-account email, or an email that isn't on
-- Luma) can ask to sign in with the email they typed; no link goes out until an admin approves
-- in Admin -> People. Approving creates or re-points the account and sends the link.
-- - luma_guest_id: the registration whose Claude-account email this is (luma_guest_for_claude_email);
--   null when the email isn't on Luma at all.
-- - Written only by server actions (service role): the login page inserts, admins decide.
--   So there is no insert policy; admins read and manage all rows.

create table login_requests (
  email          text primary key check (email = lower(email)),
  name           text not null check (length(trim(name)) between 1 and 200),
  luma_guest_id  text references luma_guests (guest_id) on delete set null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references profiles (id) on delete set null
);

create index login_requests_pending_idx on login_requests (created_at desc) where status = 'pending';

alter table login_requests enable row level security;
create policy login_requests_admin on login_requests for all using (is_admin()) with check (is_admin());
