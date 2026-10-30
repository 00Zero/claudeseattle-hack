-- 20261030211845_shared_gallery_carousel_order.sql
-- The carousel's own order, so admins can arrange highlights freely across the gallery's sections.
-- highlight_position is set while an item is highlighted and null otherwise. Existing highlights
-- keep the order they have today.

alter table gallery_items add column highlight_position integer;

update gallery_items g
  set highlight_position = o.n
  from (select id, row_number() over (order by position, id) - 1 as n from gallery_items where highlighted) o
  where g.id = o.id;

create or replace view public_gallery as
  select g.id, g.position, g.highlighted, g.caption, g.credit, g.thumbnail_url, g.image_url, g.link_url,
         m.drive_file_id,
         case when m.id is null then 'external'
              when m.mime_type like 'video/%' then 'video'
              else 'photo' end as kind,
         g.highlight_position
  from gallery_items g
  left join media_uploads m on m.id = g.media_upload_id
  where g.visible and (g.media_upload_id is null or m.deleted_at is null);
