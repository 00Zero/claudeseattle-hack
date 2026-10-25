-- 20261025073820_shared_media_uploads.sql
-- Photos and videos attendees upload at the bottom of /resources. The files live in a restricted Google Drive
-- folder; the browser sends each one straight to Google with a one-time upload link from the
-- Apps Script in scripts/apps-script/media-upload.gs. This table is the log: who uploaded what,
-- for a later gallery. It never holds the folder's ID or link.
-- - team_id: the uploader's team at upload time, if any.
-- - Written only by the upload server action (service role) after the Apps Script confirms the
--   file is in the folder, so there is no insert policy. People read their own rows; admins all.

create table media_uploads (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  team_id        uuid references teams (id) on delete set null,
  drive_file_id  text not null unique,
  file_name      text not null check (length(file_name) between 1 and 300),
  mime_type      text not null check (mime_type ~ '^(image|video)/'),
  size_bytes     bigint not null check (size_bytes > 0),
  created_at     timestamptz not null default now()
);

create index media_uploads_profile_idx on media_uploads (profile_id, created_at desc);

alter table media_uploads enable row level security;
create policy media_uploads_own   on media_uploads for select using (profile_id = auth.uid());
create policy media_uploads_admin on media_uploads for all using (is_admin()) with check (is_admin());
revoke all on media_uploads from anon;
