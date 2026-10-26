-- judge_contributions_after_deadline: "who did what" parts and teammate-added GitHub usernames stay
-- editable after submissions_close_at. There's no hard stop on submissions: late changes are kept,
-- and each part's updated_at (compared with the deadline) shows the team and judges it came in
-- late, possibly after judges scored. Same checks as before, minus judge_submissions_open().

alter policy contributions_create on judge_contributions
  with check (is_team_member(team_id) and judge_can_submit()
              and exists (select 1 from team_members m
                           where m.team_id = judge_contributions.team_id
                             and m.profile_id = judge_contributions.profile_id
                             and m.status = 'member'));

alter policy contributions_edit on judge_contributions
  using (is_team_member(team_id))
  with check (is_team_member(team_id) and judge_can_submit()
              and exists (select 1 from team_members m
                           where m.team_id = judge_contributions.team_id
                             and m.profile_id = judge_contributions.profile_id
                             and m.status = 'member'));
