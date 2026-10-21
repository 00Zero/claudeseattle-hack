-- judge_finalist_revoke: close the finalist leak in judge_is_finalist() from judge_core.
-- It is security definer and was executable by anyone through PostgREST RPC
-- (/rest/v1/rpc/judge_is_finalist), so logged-out users and participants could look up which
-- entries are finalists before publish_finalists. Owned by Dev B (judging); see app/(judge)/CLAUDE.md.

-- Same signature, so the judge_scores policies keep working. Only judges and admins get a real
-- answer; the policies that call it already require is_judge(), so they behave as before.
create or replace function judge_is_finalist(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_judge()
     and coalesce((select is_finalist from judge_entry_results where entry_id = p_entry), false)
$$;

-- The judge_scores policies call it as the logged-in judge, so authenticated keeps execute.
revoke execute on function judge_is_finalist(uuid) from public, anon;
grant  execute on function judge_is_finalist(uuid) to authenticated;
