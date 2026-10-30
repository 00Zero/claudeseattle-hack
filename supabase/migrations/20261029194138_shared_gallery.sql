-- 20261029194138_shared_gallery.sql
-- The public photo and video gallery on /gallery, arranged by admins on /admin/gallery. The page
-- has a carousel of highlights, then three kinds of section: videos, one per photographer, and
-- audience photos. Two kinds of item:
-- - An upload (media_upload_id): a photo or video from media_uploads. Adding one to the gallery
--   makes that one Drive file viewable by anyone with its link (the folder stays restricted), so
--   Google serves the thumbnail, the full photo and the video; hiding or removing it makes the file
--   private again (lib/media.ts, shareDriveUpload).
-- - A photographer's photo (thumbnail_url + link_url + credit): an image on their site that links
--   to that photo there, where people can download it. image_url is an optional larger version
--   for the carousel.
-- - position: order within its section. highlighted: also in the carousel, in the same order.
-- - visible: false keeps an item arranged but off the page.
-- Written only by admin server actions (service role). Everyone reads the page through
-- public_gallery, which leaves out hidden items and uploads their uploader deleted.

create table gallery_items (
  id               uuid primary key default gen_random_uuid(),
  media_upload_id  uuid unique references media_uploads (id) on delete cascade,
  thumbnail_url    text check (thumbnail_url ~ '^https://' and length(thumbnail_url) <= 2000),
  image_url        text check (image_url ~ '^https://' and length(image_url) <= 2000),
  link_url         text check (link_url ~ '^https://' and length(link_url) <= 2000),
  credit           text check (length(credit) between 1 and 100),
  caption          text check (length(caption) between 1 and 200),
  position         integer not null default 0,
  highlighted      boolean not null default false,
  visible          boolean not null default true,
  created_at       timestamptz not null default now(),
  check (
    (media_upload_id is not null and thumbnail_url is null and image_url is null and link_url is null and credit is null)
    or (media_upload_id is null and thumbnail_url is not null and link_url is not null and credit is not null)
  )
);

create index gallery_items_position_idx on gallery_items (position);

alter table gallery_items enable row level security;
create policy gallery_items_admin on gallery_items for all using (is_admin()) with check (is_admin());
revoke all on gallery_items from anon;
revoke insert, update, delete on gallery_items from authenticated;

-- What /gallery shows, in order. Like public_teams, the view reads the tables as its owner, so
-- anonymous visitors get these columns and nothing else from media_uploads (no uploader, team or
-- file name).
create view public_gallery as
  select g.id, g.position, g.highlighted, g.caption, g.credit, g.thumbnail_url, g.image_url, g.link_url,
         m.drive_file_id,
         case when m.id is null then 'external'
              when m.mime_type like 'video/%' then 'video'
              else 'photo' end as kind
  from gallery_items g
  left join media_uploads m on m.id = g.media_upload_id
  where g.visible and (g.media_upload_id is null or m.deleted_at is null);

grant select on public_gallery to anon, authenticated;
