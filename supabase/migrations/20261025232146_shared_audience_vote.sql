-- 20261025232146_shared_audience_vote.sql
-- Audience choice: checked-in guests rank the finalists on /vote, first to third. First place
-- gets 3 points, second 2, third 1; the most points wins, ties broken by first-place votes.
-- - event_settings.audience_voting: NULL = not open yet, 'open', 'closed'. Super admins switch
--   it from the awards deck (/slides/awards).
-- - audience_votes: one ballot per person, changeable while voting is open. Written only by
--   cast_audience_vote(); people read their own row.
-- - Guests can't vote for their own team: it isn't on their ballot, and they rank as many of
--   the others as there are (up to three).
-- - Test accounts vote on the test world's finalists without checking in, for rehearsals.
-- - audience_vote_results: points per finalist. Service role only (the awards deck).

alter table event_settings add column audience_voting text
  check (audience_voting in ('open', 'closed'));

create table audience_votes (
  voter_id      uuid primary key references profiles (id) on delete cascade,
  first_entry   uuid not null references judge_entries (id) on delete cascade,
  second_entry  uuid references judge_entries (id) on delete cascade,
  third_entry   uuid references judge_entries (id) on delete cascade,
  is_test       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (second_entry is distinct from first_entry),
  check (third_entry is null or (second_entry is not null
                                 and third_entry <> first_entry and third_entry <> second_entry))
);
create trigger audience_votes_updated before update on audience_votes
  for each row execute function set_updated_at();

alter table audience_votes enable row level security;
revoke all on audience_votes from anon;
revoke insert, update, delete on audience_votes from authenticated;
create policy audience_votes_own on audience_votes for select using (voter_id = auth.uid());
create policy audience_votes_admin on audience_votes for all using (is_admin()) with check (is_admin());

-- Finalists the caller may rank: their world's finalists, minus their own team.
create or replace function audience_vote_options()
returns table (entry_id uuid, team_name text, title text, tagline text, own_team boolean)
language sql stable security definer set search_path = public as $$
  select r.entry_id, r.team_name, r.title, e.tagline,
         coalesce(r.team_id is not null and is_team_member(r.team_id), false)
    from judge_entry_results r
    join judge_entries e on e.id = r.entry_id
   where r.is_finalist and r.is_test = viewer_is_test()
   order by r.team_name
$$;
revoke execute on function audience_vote_options() from public, anon, authenticated;

-- Everything /vote needs in one call: the voting state, whether the caller may vote, and, once
-- voting has opened, the finalists and the caller's ballot.
create or replace function audience_ballot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_state text := (select audience_voting from event_settings where id = 1);
  v_eligible boolean := auth.uid() is not null and (is_checked_in() or viewer_is_test());
  v_vote audience_votes;
begin
  if not v_eligible or v_state is null then
    return jsonb_build_object('state', coalesce(v_state, 'not_open'), 'eligible', v_eligible,
                              'finalists', '[]'::jsonb, 'ranking', '[]'::jsonb);
  end if;
  select * into v_vote from audience_votes where voter_id = auth.uid();
  return jsonb_build_object(
    'state', v_state,
    'eligible', true,
    'finalists', coalesce((select jsonb_agg(jsonb_build_object(
                             'entryId', o.entry_id, 'team', o.team_name, 'title', o.title,
                             'tagline', o.tagline, 'ownTeam', o.own_team))
                             from audience_vote_options() o), '[]'::jsonb),
    'ranking', case when v_vote.voter_id is null then '[]'::jsonb
                    else to_jsonb(array_remove(array[v_vote.first_entry, v_vote.second_entry,
                                                     v_vote.third_entry], null)) end);
end $$;
revoke execute on function audience_ballot() from public, anon;
grant execute on function audience_ballot() to authenticated;

-- Saves the caller's ranking, best first. Rank as many finalists as the ballot offers, up to three.
create or replace function cast_audience_vote(p_ranking uuid[]) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_options uuid[];
  v_needed int;
begin
  if auth.uid() is null or not (is_checked_in() or viewer_is_test()) then
    raise exception 'Only checked-in guests can vote.';
  end if;
  if (select audience_voting from event_settings where id = 1) is distinct from 'open' then
    raise exception 'Voting isn''t open.';
  end if;
  select coalesce(array_agg(entry_id), '{}') into v_options
    from audience_vote_options() where not own_team;
  v_needed := least(3, cardinality(v_options));
  if v_needed = 0 then
    raise exception 'There are no finalists to vote for.';
  end if;
  if coalesce(cardinality(p_ranking), 0) <> v_needed
     or array_position(p_ranking, null) is not null
     or (select count(distinct x) from unnest(p_ranking) x) <> v_needed
     or not p_ranking <@ v_options then
    raise exception 'Pick your top % finalists, each once.', v_needed;
  end if;
  insert into audience_votes (voter_id, first_entry, second_entry, third_entry, is_test)
  values (auth.uid(), p_ranking[1], p_ranking[2], p_ranking[3], viewer_is_test())
  on conflict (voter_id) do update
    set first_entry = excluded.first_entry, second_entry = excluded.second_entry,
        third_entry = excluded.third_entry, is_test = excluded.is_test;
end $$;
revoke execute on function cast_audience_vote(uuid[]) from public, anon;
grant execute on function cast_audience_vote(uuid[]) to authenticated;

-- Points per finalist. Runs as owner on purpose (bypasses RLS); service role only.
create view audience_vote_results as
  with points as (
    select first_entry as entry_id, 3 as points, 1 as first_votes from audience_votes
    union all
    select second_entry, 2, 0 from audience_votes where second_entry is not null
    union all
    select third_entry, 1, 0 from audience_votes where third_entry is not null
  ),
  totals as (
    select r.entry_id, r.team_id, r.team_name, r.title, r.is_test,
           coalesce(sum(p.points), 0)::int as points,
           coalesce(sum(p.first_votes), 0)::int as first_votes,
           count(p.entry_id)::int as ballots
      from judge_entry_results r
      left join points p on p.entry_id = r.entry_id
     where r.is_finalist
     group by r.entry_id, r.team_id, r.team_name, r.title, r.is_test
  )
  select totals.*,
         rank() over (partition by is_test order by points desc, first_votes desc) as place
    from totals;
revoke all on audience_vote_results from anon, authenticated;
comment on view audience_vote_results is
  'Audience choice points per finalist. Service role only, server-side only. Runs as owner on purpose.';
