-- judge_access: the two things a judge may read across judges, through checked functions
-- instead of the service role. judge_entry_results itself stays service-role only.
-- Owned by Dev B (judging); see app/(judge)/CLAUDE.md.

-- The final round: every finalist. Judges and admins only; empty for anyone else.
create or replace function judge_finalists()
returns table (entry_id uuid, team_name text, title text)
language sql stable security definer set search_path = public as $$
  select r.entry_id, r.team_name, r.title
    from judge_entry_results r
   where r.is_finalist and is_judge()
   order by r.team_name
$$;

-- /judge/results: finalists ranked by mean final score with how many judges scored each.
-- Empty until the caller has a final score for every finalist, so nobody anchors on other
-- judges' scores. Prelim scores are never returned.
create or replace function judge_final_standings()
returns table (entry_id uuid, team_name text, title text, final_score numeric, final_votes bigint, place bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_judge() then
    return;
  end if;
  if exists (
    select 1 from judge_entry_results r
     where r.is_finalist
       and not exists (select 1 from judge_scores s
                        where s.entry_id = r.entry_id and s.judge_id = auth.uid() and s.round = 'final')
  ) then
    return;
  end if;
  return query
    select r.entry_id, r.team_name, r.title, r.final_score, r.final_votes, r.place
      from judge_entry_results r
     where r.is_finalist
     order by r.final_score desc nulls last, r.team_name;
end $$;

revoke execute on function judge_finalists()       from public, anon;
revoke execute on function judge_final_standings() from public, anon;
grant  execute on function judge_finalists()       to authenticated;
grant  execute on function judge_final_standings() to authenticated;
