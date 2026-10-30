-- 20261030212009_shared_gallery_youtube.sql
-- YouTube videos in the gallery, a third kind of item next to uploads and photographers' photos.
-- youtube_id comes from parseVideo (app/(judge)/_lib/video.ts); the thumbnail and player are built
-- from it. On the page they're videos like uploaded ones, in the Videos section.

alter table gallery_items add column youtube_id text unique check (youtube_id ~ '^[A-Za-z0-9_-]{6,64}$');

alter table gallery_items drop constraint gallery_items_check;
alter table gallery_items add constraint gallery_items_source_check check (
  (media_upload_id is not null and youtube_id is null and thumbnail_url is null and image_url is null and link_url is null and credit is null)
  or (youtube_id is not null and media_upload_id is null and thumbnail_url is null and image_url is null and link_url is null and credit is null)
  or (media_upload_id is null and youtube_id is null and thumbnail_url is not null and link_url is not null and credit is not null)
);

create or replace view public_gallery as
  select g.id, g.position, g.highlighted, g.caption, g.credit, g.thumbnail_url, g.image_url, g.link_url,
         m.drive_file_id,
         case when g.youtube_id is not null then 'video'
              when m.id is null then 'external'
              when m.mime_type like 'video/%' then 'video'
              else 'photo' end as kind,
         g.highlight_position,
         g.youtube_id
  from gallery_items g
  left join media_uploads m on m.id = g.media_upload_id
  where g.visible and (g.media_upload_id is null or m.deleted_at is null);
