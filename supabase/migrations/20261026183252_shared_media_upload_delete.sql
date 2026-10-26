-- 20261026183252_shared_media_upload_delete.sql
-- People can delete a photo or video they uploaded by mistake (/resources, deleteMediaUpload in
-- app/resources/media-actions.ts). The file goes to the Drive folder owner's trash, where it stays
-- 30 days, and its row is kept with deleted_at set, so admins can still see what was removed.
-- Writes stay with the service role after the server checks the uploader.

alter table media_uploads add column deleted_at timestamptz;
