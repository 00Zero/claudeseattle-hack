-- shared_judging_criteria: admins choose which rubric criteria judges score (a fifth one,
-- Teamwork, is off by default), and every score records which criteria it covers.
-- Owned by Dev B (judging); see app/(judge)/CLAUDE.md. Shared only because the setting lives on
-- event_settings, next to the other event switches.
-- - Criteria are stable keys from lib/event.ts (rubric.criteria[].key): works, ease, impact,
--   creativity, teamwork. Names and anchors stay in the app; positions in an array never carry
--   meaning on their own any more.
-- - null means the original four in rubric order (works, ease, impact, creativity), so every
--   existing row and the current setting stay valid without a data change.
-- - Additive: nullable columns, and the two "exactly four scores" checks replaced by checks
--   that a score array matches its criteria.
-- - The app locks the setting once any real-world score exists (app/admin/judging/actions.ts),
--   so every score in a round uses the same criteria. Test-world scores don't lock it.
-- - judge_entry_results needs no change: a judge's entry score is already the mean of the
--   scores array, whatever its length.

-- 1. The setting: enabled criteria keys, in rubric order. Written by admins with the service
-- role after assertAdmin(); readable by anyone like the rest of event_settings (the rubric is
-- public on the home page).
alter table event_settings add column judging_criteria text[]
  check (judging_criteria is null
         or (cardinality(judging_criteria) >= 1 and array_position(judging_criteria, null) is null));

-- 2. Scores: the keys the scores array covers, same order. null = the original four.
alter table judge_scores add column criteria text[];
alter table judge_scores add constraint judge_scores_criteria_check
  check ((criteria is null or (cardinality(criteria) >= 1 and array_position(criteria, null) is null))
         and cardinality(scores) = coalesce(cardinality(criteria), 4)
         and array_position(scores, null) is null and 1 <= all (scores) and 8 >= all (scores));
alter table judge_scores drop constraint judge_scores_scores_check;
-- Judges update only scores, comment (judge_core) and now criteria, on their own rows (RLS).
grant update (criteria) on judge_scores to authenticated;

-- 3. The admin-only AI tie-break rating: same change. Service role only, as before.
alter table judge_ai_ratings add column criteria text[];
alter table judge_ai_ratings add constraint judge_ai_ratings_criteria_check
  check ((criteria is null or (cardinality(criteria) >= 1 and array_position(criteria, null) is null))
         and cardinality(scores) = coalesce(cardinality(criteria), 4)
         and array_position(scores, null) is null and 1 <= all (scores) and 8 >= all (scores));
alter table judge_ai_ratings drop constraint judge_ai_ratings_scores_check;

-- 4. "Who did what": an optional line per member, for the Teamwork criterion. Team-editable
-- like the other content columns; readable by the team and judges (entries_read), not public
-- (public_judge_entries doesn't select it).
alter table judge_entries add column contributions text;
grant insert (contributions), update (contributions) on judge_entries to authenticated;
