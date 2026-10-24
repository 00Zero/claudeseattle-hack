-- 20261024193938_shared_technical_rating.sql
-- Technical level 1–5 (docs/REQUIREMENTS.md, Teams nice-to-have 6). Additive only.
--
-- 1. profiles.technical_level: the person's own rating, the one that counts. Self-service like
--    is_technical; the app also sets is_technical = (technical_level >= 3) on save, so balance,
--    filters and matching keep reading is_technical. Pages show others a band (none 1–2,
--    some 3, builder 4–5), never the number.
-- 2. profile_technical_ai: Claude's suggestion from the person's Luma answers, LinkedIn
--    enrichment and attendee survey (lib/technical-rating.ts). A separate table, not profiles
--    columns, because anyone who can browse can read every profiles column through the API,
--    and the reason can repeat private answers. Written and read with the service role only:
--    the person sees just the suggested number on their own profile form; the reason is for
--    admins. No policies, so the API gives anon and authenticated nothing.

alter table profiles add column technical_level smallint check (technical_level between 1 and 5);
grant update (technical_level) on profiles to authenticated;

create table profile_technical_ai (
  profile_id  uuid primary key references profiles (id) on delete cascade,
  level       smallint not null check (level between 1 and 5),
  reason      text not null,         -- one sentence; admin-only, may reflect private answers
  model       text not null,
  input_hash  text not null,         -- fingerprint of the inputs; a new hash means re-suggest
  created_at  timestamptz not null default now()
);

alter table profile_technical_ai enable row level security;
revoke all on profile_technical_ai from anon, authenticated;

comment on table profile_technical_ai is
  'AI-suggested technical level. Service role only. Never show the reason to anyone but admins.';
