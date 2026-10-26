-- 20261026171927_shared_followup_survey.sql
-- Post-event feedback survey, sent from Admin -> Email (app/admin/email, lib/followup/*).
-- - followup_invites: one per email address. The token in the survey link (/survey/<token>) is the
--   only way in, so people answer without signing in. Delivery, opens, bounces and complaints come
--   from Resend's webhook (/api/email/resend-webhook); visits and answers from the survey page.
-- - followup_responses: the answers, one row per invite, overwritten if they answer again.
-- - followup_emails: the subject and text an admin edited for each group; groups without a row use
--   the defaults in lib/followup/emails.ts.
-- - luma_guests.cancelled_at: when the guest cancelled on Luma, from Luma's "Guest update" emails
--   (the CSV export has no date). Finds same-day cancellations. The Luma import leaves it alone.
-- - luma_guests.happy_hour_status / happy_hour_checked_in_at: the guest's row in the separate Luma event
--   for Saturday's team formation happy hour (approved, invited, declined), matched by email. The
--   survey asks people who came how useful it was, and others why they didn't come.
-- Admins read everything here; every write goes through the service role after a server check.

alter table luma_guests add column cancelled_at timestamptz;
alter table luma_guests add column happy_hour_status text;
alter table luma_guests add column happy_hour_checked_in_at timestamptz;

create table followup_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  email text not null unique check (email = lower(email)),
  first_name text,
  luma_guest_id text references luma_guests(guest_id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,
  -- attended, unsure (on a team, no check-in), crew, no_show, late_cancel, standby: lib/followup/groups.ts
  grp text not null check (grp in ('attended', 'unsure', 'crew', 'no_show', 'late_cancel', 'standby')),
  -- participant, standby, mentor, judge, volunteer or ambassador: picks the role questions
  role text not null check (role in ('participant', 'standby', 'mentor', 'judge', 'volunteer', 'ambassador')),
  -- checked in at Saturday's happy hour: picks the happy hour question
  happy_hour boolean not null default false,
  resend_id text unique,
  sent_at timestamptz,
  send_error text,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  visits int not null default 0,
  -- who was signed in when the survey was opened (may differ from the invitee)
  visit_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index followup_invites_grp_idx on followup_invites (grp);

create table followup_responses (
  invite_id uuid primary key references followup_invites(id) on delete cascade,
  -- { track, quick: {...}, more: bool, detail: {...}, additional: text }: lib/followup/survey.ts
  answers jsonb not null,
  signed_in_profile_id uuid references profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table followup_emails (
  grp text primary key check (grp in ('attended', 'unsure', 'crew', 'no_show', 'late_cancel', 'standby')),
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) between 1 and 10000),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

alter table followup_invites enable row level security;
alter table followup_responses enable row level security;
alter table followup_emails enable row level security;

create policy followup_invites_admin on followup_invites for select using (is_admin());
create policy followup_responses_admin on followup_responses for select using (is_admin());
create policy followup_emails_admin on followup_emails for select using (is_admin());

revoke all on followup_invites, followup_responses, followup_emails from anon;
grant select on followup_invites, followup_responses, followup_emails to authenticated;
