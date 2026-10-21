-- 0007_shared_business_insights.sql
-- Anonymous copy of the small business survey, for the public dataset. Owned by Adam.
-- Changes require both devs' review.
-- Revenue may be published, but never next to who answered. So each small business sync
-- stores two copies: survey_responses (identifiable, no revenue; feeds matching) and
-- business_insights (answers plus revenue; no email, LinkedIn, business name, website,
-- timestamp or response key, rewritten in random order each sync, so a row can't be traced
-- back). scripts/export-business-insights.ts reads only business_insights.

create table business_insights (
  id         uuid primary key default gen_random_uuid(),
  answers    jsonb not null,          -- lib/surveys.ts keys, plus revenue
  synced_at  timestamptz not null default now()
);
alter table business_insights enable row level security;
create policy insights_admin on business_insights for all using (is_admin()) with check (is_admin());
revoke all on business_insights from anon;

-- Replace all rows with p_rows (a JSON array of answer objects), in random order. Service role only.
create or replace function replace_business_insights(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows: refusing to empty business_insights';
  end if;
  delete from business_insights where true;
  insert into business_insights (answers)
  select r from jsonb_array_elements(p_rows) r order by random();
  return jsonb_array_length(p_rows);
end $$;
revoke execute on function replace_business_insights(jsonb) from public, anon, authenticated;
