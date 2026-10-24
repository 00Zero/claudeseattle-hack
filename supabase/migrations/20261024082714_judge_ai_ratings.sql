-- judge_ai_ratings: Claude's own rating of each entry, for admins only, as an optional tie-breaker.
-- Owned by Dev B (judging); see app/(judge)/CLAUDE.md.
-- - Decided Oct 24: judges never see AI-suggested scores. judge_ai_notes is readable by judges
--   (ai_notes_read), so the rating can't live there; the app stops writing its draft_scores.
-- - Never public, never shown to judges, never added to human scores. Admins see it on
--   /admin/judging when they choose to, to break a tie by hand.
-- - Additive only: a new table. Written and read with the service role after an admin check;
--   no policies, so the API gives anon and authenticated nothing.

create table judge_ai_ratings (
  entry_id    uuid primary key references judge_entries (id) on delete cascade,
  model       text not null,
  scores      smallint[] not null,   -- four criteria, 1–8, in the order of rubric.criteria
  rating      numeric(3, 1) not null, -- mean of scores, one decimal
  created_at  timestamptz not null default now(),
  check (cardinality(scores) = 4 and array_position(scores, null) is null
         and 1 <= all (scores) and 8 >= all (scores)),
  check (rating between 1 and 8)
);

alter table judge_ai_ratings enable row level security;
revoke all on judge_ai_ratings from anon, authenticated;

comment on table judge_ai_ratings is
  'Admin-only AI tie-break rating. Service role only, after an admin check. Never shown to judges or the public.';
