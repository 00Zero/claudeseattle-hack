-- judge_group_scores: a judge in a judging group sees the group's prelim scores, once they've
-- scored all of their own entries, so nobody leans on the others' scores before giving theirs.
-- Owned by Dev B (judging); see app/(judge)/CLAUDE.md.
-- - One row per entry assigned to the caller and per member of their group (the caller included),
--   with that member's prelim scores, or nulls if they haven't scored it yet.
-- - Empty for anyone who isn't a judge, isn't in a group, or still has an entry to score.
-- - Never comments, final-round scores, or other groups' scores. Admins read every score with the
--   service role (/admin/judging/scores).

create or replace function judge_group_scores()
returns table (entry_id uuid, judge_id uuid, judge_name text, scores smallint[], criteria text[])
language plpgsql stable security definer set search_path = public as $$
declare
  my_group uuid;
begin
  if not is_judge() then
    return;
  end if;
  select m.group_id into my_group from judge_group_members m where m.judge_id = auth.uid();
  if my_group is null then
    return;
  end if;
  if exists (
    select 1 from judge_assignments a
     where a.judge_id = auth.uid()
       and not exists (select 1 from judge_scores s
                        where s.entry_id = a.entry_id and s.judge_id = auth.uid() and s.round = 'prelim')
  ) then
    return;
  end if;
  return query
    select a.entry_id, m.judge_id, p.display_name, s.scores, s.criteria
      from judge_assignments a
      join judge_group_members m on m.group_id = my_group
      join profiles p on p.id = m.judge_id
      left join judge_scores s
        on s.entry_id = a.entry_id and s.judge_id = m.judge_id and s.round = 'prelim'
     where a.judge_id = auth.uid()
     order by a.entry_id, p.display_name;
end $$;

revoke execute on function judge_group_scores() from public, anon;
grant  execute on function judge_group_scores() to authenticated;
