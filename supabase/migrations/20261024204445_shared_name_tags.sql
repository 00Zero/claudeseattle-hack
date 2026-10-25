-- 20261024204445_shared_name_tags.sql
-- "Print my name tag" on /profile. A click stores a snapshot of the name tag here; the name tag
-- printer (a laptop running github.com/00Zero/thermal-printer) polls /api/name-tags/feed and
-- prints each new row.
-- - event_settings.name_tags_enabled: the admin switch at /admin/settings. NULL counts as off.
--   Printing is also off once event_ends_at has passed, whatever the switch says (lib/name-tags.ts).
-- - name_tag_prints: written only by the server action (service role) after it checks the switch
--   and the 5-minute wait, so there is no insert policy. People read their own rows; admins all.

alter table event_settings add column name_tags_enabled boolean;

create table name_tag_prints (
  id            bigint generated always as identity primary key,
  profile_id    uuid not null references profiles (id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  job_title     text,
  company       text,
  role_label    text,
  requested_at  timestamptz not null default now()
);

create index name_tag_prints_profile_idx on name_tag_prints (profile_id, requested_at desc);
create index name_tag_prints_requested_idx on name_tag_prints (requested_at);

alter table name_tag_prints enable row level security;
create policy name_tag_prints_self_read on name_tag_prints for select using (profile_id = auth.uid());
create policy name_tag_prints_admin on name_tag_prints for all using (is_admin()) with check (is_admin());
