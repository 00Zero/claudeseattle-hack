-- 20261026220826_shared_small_business_requests.sql
-- Searches from the finder on /small-businesses (public): what a business told us, its answers to
-- the follow-up questions, and the projects it was shown. The organizers read them in
-- Admin -> Small businesses to see what businesses want; the page says they aren't shared outside
-- the organizers without the business's approval.
-- - visitor_id: a random id in an httpOnly cookie, so a visitor's searches group together and the
--   finder can ask for an email after the first search (lib/small-business-options.ts, FREE_SEARCHES).
-- - profile_id: set when a signed-in person searched.
-- - follow_ups: [{question, answer}]; matches: [{id, title, fit, reason}], best first.
-- - Written only by the finder's server actions (service role), so there is no insert policy;
--   admins read and manage all rows.

create table small_business_requests (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  visitor_id     uuid not null,
  profile_id     uuid references profiles (id) on delete set null,
  email          text check (email = lower(email)),
  business_name  text,
  website        text,
  industry       text,
  team_size      text,
  tools          text,
  about          text,
  challenges     text,
  opportunities  text,
  follow_ups     jsonb not null default '[]',
  matches        jsonb not null default '[]'
);

create index small_business_requests_visitor_idx on small_business_requests (visitor_id);
create index small_business_requests_created_idx on small_business_requests (created_at desc);

alter table small_business_requests enable row level security;
create policy small_business_requests_admin on small_business_requests for all using (is_admin()) with check (is_admin());
