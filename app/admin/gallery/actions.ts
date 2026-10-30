"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { shareDriveUpload } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { youtubeIdFrom, youtubeWatch } from "@/lib/gallery";

// Admin writes for /gallery (gallery_items, *_shared_gallery.sql). An upload is shared to anyone
// with its link while it's visible in the gallery, and private again when hidden or removed.

export type FormState = { ok: boolean; message: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidate() {
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
}

function scriptError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  // The deployed Apps Script predates the gallery's share and thumbnail actions.
  return message === "Unknown action"
    ? "the Apps Script needs a new deployment with the gallery actions (scripts/apps-script/media-upload.gs)"
    : message;
}

async function setShared(driveFileId: string, shared: boolean) {
  try {
    await shareDriveUpload(driveFileId, shared);
  } catch (error) {
    throw new Error(`Drive sharing didn't change: ${scriptError(error)}.`);
  }
}

// Positions for `count` new items at the start or the end of the gallery.
async function newPositions(count: number, where: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("gallery_items")
    .select("position")
    .order("position", { ascending: where === "start" })
    .limit(1)
    .maybeSingle();
  const edge = data?.position ?? 0;
  return Array.from({ length: count }, (_, i) => (where === "start" ? edge - count + i : edge + 1 + i));
}

// One https link, or an error naming the field.
function httpsUrl(value: string, label: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && value.length <= 2000) return url.toString();
  } catch {}
  throw new Error(`${label} needs to be a full https:// link.`);
}

function optional(value: string, max: number, label: string) {
  if (value.length > max) throw new Error(`Keep the ${label} to ${max} characters.`);
  return value || null;
}

// Runs `task` on each item, a few at a time (each Apps Script call takes a second or two).
async function eachLimited<T>(items: T[], task: (item: T) => Promise<void>, limit = 4) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
    }),
  );
}

// Adds the checked uploads, oldest first, at the start or end of the gallery. Each file is shared
// first; any that Drive refuses are left out and named in the message.
export async function addUploads(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const ids = formData.getAll("upload").filter((v): v is string => typeof v === "string" && UUID.test(v));
  if (ids.length === 0) return { ok: false, message: "Check at least one photo or video." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("media_uploads")
    .select("id, drive_file_id, gallery_items(id)")
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at");
  const uploads = ((data ?? []) as { id: string; drive_file_id: string; gallery_items: { id: string }[] | { id: string } | null }[]).filter(
    (u) => !u.gallery_items || (Array.isArray(u.gallery_items) && u.gallery_items.length === 0),
  );
  if (uploads.length === 0) return { ok: false, message: "Those are already in the gallery or were deleted." };

  const shared = new Set<string>();
  const failures: string[] = [];
  await eachLimited(uploads, async (u) => {
    try {
      await shareDriveUpload(u.drive_file_id, true);
      shared.add(u.id);
    } catch (error) {
      failures.push(scriptError(error));
    }
  });
  const adding = uploads.filter((u) => shared.has(u.id));
  if (adding.length > 0) {
    const positions = await newPositions(adding.length, field(formData, "where"));
    const { error } = await admin.from("gallery_items").insert(adding.map((u, i) => ({ media_upload_id: u.id, position: positions[i] })));
    if (error) return { ok: false, message: `Shared in Drive but not added: ${error.message}` };
  }
  revalidate();
  const added = `Added ${adding.length} of ${uploads.length}.`;
  return failures.length === 0
    ? { ok: true, message: added }
    : { ok: false, message: `${added} Drive refused ${failures.length}: ${[...new Set(failures)].join("; ")}` };
}

// Adds a photographer's photos, one per line: "<thumbnail> [<link to the photo>] [<larger image>]".
// A line without its own link uses the gallery link; the larger image is for the carousel.
export async function addPhotographer(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  try {
    const credit = field(formData, "credit");
    if (!credit || credit.length > 100) throw new Error("Give the photographer's name (up to 100 characters).");
    const link = field(formData, "link") ? httpsUrl(field(formData, "link"), "The gallery link") : null;
    const lines = field(formData, "thumbnails")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) throw new Error("Paste at least one thumbnail link.");
    if (lines.length > 200) throw new Error("Add up to 200 thumbnails at a time.");
    const rows = lines.map((line, i) => {
      const [thumbnail, own, large] = line.split(/\s+/);
      const linkUrl = own ? httpsUrl(own, `Line ${i + 1}'s link`) : link;
      if (!linkUrl) throw new Error(`Line ${i + 1} has no link; add the gallery link above or one after the thumbnail.`);
      return {
        thumbnail_url: httpsUrl(thumbnail, `Line ${i + 1}'s thumbnail`),
        link_url: linkUrl,
        image_url: large ? httpsUrl(large, `Line ${i + 1}'s larger image`) : null,
        credit,
      };
    });
    const positions = await newPositions(rows.length, field(formData, "where"));
    const { error } = await createAdminClient()
      .from("gallery_items")
      .insert(rows.map((row, i) => ({ ...row, position: positions[i] })));
    if (error) throw new Error(error.message);
    revalidate();
    return { ok: true, message: `Added ${rows.length} photo${rows.length === 1 ? "" : "s"} by ${credit}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't add them." };
  }
}

// A video's title, and whether it can be embedded: YouTube answers 401 when embedding is off and 404
// when the video is private or gone. A network failure doesn't block adding it, just the title.
async function youtubeInfo(id: string) {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatch(id))}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (response.status === 401 || response.status === 403) return { problem: "doesn't allow embedding" };
    if (response.status === 404 || response.status === 400) return { problem: "is private or doesn't exist" };
    if (!response.ok) return { title: null };
    const { title } = (await response.json()) as { title?: string };
    return { title: title?.trim().slice(0, 200) || null };
  } catch {
    return { title: null };
  }
}

// Adds YouTube videos, one link per line, with their YouTube titles as captions (editable on the card).
export async function addYouTube(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();
  const lines = field(formData, "links")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, message: "Paste at least one YouTube link." };
  if (lines.length > 50) return { ok: false, message: "Add up to 50 videos at a time." };
  const ids = [...new Set(lines.map(youtubeIdFrom))];
  const bad = lines.findIndex((line) => !youtubeIdFrom(line));
  if (bad >= 0) return { ok: false, message: `Line ${bad + 1} isn't a YouTube video link.` };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("gallery_items").select("youtube_id").in("youtube_id", ids as string[]);
  const taken = new Set((existing ?? []).map((r) => r.youtube_id));
  const fresh = (ids as string[]).filter((id) => !taken.has(id));
  if (fresh.length === 0) return { ok: false, message: "Those videos are already in the gallery." };

  const infos = await Promise.all(fresh.map(youtubeInfo));
  const problem = infos.findIndex((info) => info.problem);
  if (problem >= 0) return { ok: false, message: `${youtubeWatch(fresh[problem])} ${infos[problem].problem}. Nothing was added.` };

  const positions = await newPositions(fresh.length, field(formData, "where"));
  const { error } = await admin
    .from("gallery_items")
    .insert(fresh.map((youtube_id, i) => ({ youtube_id, caption: infos[i].title ?? null, position: positions[i] })));
  if (error) return { ok: false, message: error.message };
  revalidate();
  const skipped = (ids as string[]).length - fresh.length;
  return { ok: true, message: `Added ${fresh.length} video${fresh.length === 1 ? "" : "s"}${skipped ? `; ${skipped} already in the gallery` : ""}.` };
}

// Saves the gallery's order: positions follow the list of ids.
export async function saveOrder(ids: string[]) {
  await assertAdmin();
  if (!Array.isArray(ids) || ids.length > 5000 || !ids.every((id) => typeof id === "string" && UUID.test(id))) throw new Error("Bad order.");
  const admin = createAdminClient();
  const results = await Promise.all(ids.map((id, position) => admin.from("gallery_items").update({ position }).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  revalidate();
}

// Saves the carousel's order: positions follow the list of ids.
export async function saveCarouselOrder(ids: string[]) {
  await assertAdmin();
  if (!Array.isArray(ids) || ids.length > 5000 || !ids.every((id) => typeof id === "string" && UUID.test(id))) throw new Error("Bad order.");
  const admin = createAdminClient();
  const results = await Promise.all(ids.map((id, highlight_position) => admin.from("gallery_items").update({ highlight_position }).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  revalidate();
}

type Row = { id: string; media_upload_id: string | null; youtube_id: string | null; media_uploads: { drive_file_id: string; deleted_at: string | null } | null };

async function item(id: string) {
  if (!UUID.test(id)) throw new Error("Unknown item.");
  const { data } = await createAdminClient()
    .from("gallery_items")
    .select("id, media_upload_id, youtube_id, media_uploads(drive_file_id, deleted_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("That item is already gone.");
  return data as unknown as Row;
}

// The Drive file behind an upload item, unless the uploader deleted it (it's in Drive's trash).
function liveFile(row: Row) {
  return row.media_uploads && !row.media_uploads.deleted_at ? row.media_uploads.drive_file_id : null;
}

export async function setVisible(formData: FormData) {
  await assertAdmin();
  const row = await item(field(formData, "id"));
  const visible = field(formData, "visible") === "true";
  const file = liveFile(row);
  if (file) await setShared(file, visible);
  const { error } = await createAdminClient().from("gallery_items").update({ visible }).eq("id", row.id);
  if (error) throw new Error(error.message);
  revalidate();
}

// Puts an item at the end of the carousel, or takes it out.
export async function setHighlighted(formData: FormData) {
  await assertAdmin();
  const row = await item(field(formData, "id"));
  const admin = createAdminClient();
  const highlighted = field(formData, "highlighted") === "true";
  const { data: last } = await admin
    .from("gallery_items")
    .select("highlight_position")
    .not("highlight_position", "is", null)
    .order("highlight_position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin
    .from("gallery_items")
    .update({ highlighted, highlight_position: highlighted ? (last?.highlight_position ?? -1) + 1 : null })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function updateItem(formData: FormData) {
  await assertAdmin();
  const row = await item(field(formData, "id"));
  const changes: Record<string, unknown> = { caption: optional(field(formData, "caption"), 200, "caption") };
  if (!row.media_upload_id && !row.youtube_id) {
    const credit = field(formData, "credit");
    if (!credit || credit.length > 100) throw new Error("Give the photographer's name (up to 100 characters).");
    changes.credit = credit;
    changes.link_url = httpsUrl(field(formData, "link_url"), "The link");
    changes.thumbnail_url = httpsUrl(field(formData, "thumbnail_url"), "The thumbnail");
    changes.image_url = field(formData, "image_url") ? httpsUrl(field(formData, "image_url"), "The larger image") : null;
  }
  const { error } = await createAdminClient().from("gallery_items").update(changes).eq("id", row.id);
  if (error) throw new Error(error.message);
  revalidate();
}

// Takes an item off the gallery; an upload's file goes back to private (it stays in the folder).
export async function removeItem(formData: FormData) {
  await assertAdmin();
  const row = await item(field(formData, "id"));
  const file = liveFile(row);
  if (file) await setShared(file, false);
  const { error } = await createAdminClient().from("gallery_items").delete().eq("id", row.id);
  if (error) throw new Error(error.message);
  revalidate();
}
