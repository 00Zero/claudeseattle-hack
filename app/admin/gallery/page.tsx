import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { driveImage, driveView } from "@/lib/gallery";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";
import { Arranger, type ArrangedItem } from "./arranger";
import { AddPhotographer, UploadPicker, type PickableUpload } from "./add-forms";

// Arranges the public /gallery: which uploads and photographers' thumbnails it shows, in what
// order and under which headings. Uploads not yet in the gallery are private in Drive, so their
// previews come through the admin-only thumbnail route.

type Upload = {
  id: string;
  drive_file_id: string;
  mime_type: string;
  created_at: string;
  deleted_at: string | null;
  profiles: { first_name: string; last_name: string; is_test: boolean } | null;
  teams: { name: string } | null;
};

type Item = {
  id: string;
  caption: string | null;
  credit: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  link_url: string | null;
  visible: boolean;
  highlighted: boolean;
  media_uploads: Upload | null;
};

const uploadFields = "id, drive_file_id, mime_type, created_at, deleted_at, profiles(first_name, last_name, is_test), teams(name)";

function uploader(u: Upload) {
  const name = `${u.profiles?.first_name ?? ""} ${u.profiles?.last_name ?? ""}`.trim() || "Guest";
  return u.teams ? `${name} · ${u.teams.name}` : name;
}

function adminThumbnail(u: Upload) {
  return `/admin/gallery/thumbnail/${u.id}`;
}

export default async function GalleryAdminPage() {
  await requireAdminPage();
  const admin = createAdminClient();
  const [{ data: itemData, error }, { data: uploadData }] = await Promise.all([
    admin
      .from("gallery_items")
      .select(`id, caption, credit, thumbnail_url, image_url, link_url, visible, highlighted, media_uploads(${uploadFields})`)
      .order("position")
      .order("id"),
    admin.from("media_uploads").select(`${uploadFields}, gallery_items(id)`).is("deleted_at", null).order("created_at", { ascending: false }).limit(2000),
  ]);
  if (error) throw new Error(error.message);
  const rows = (itemData ?? []) as unknown as Item[];
  const inGallery = new Set(rows.map((r) => r.media_uploads?.id).filter(Boolean));

  const items: ArrangedItem[] = rows.map((r) => {
    const u = r.media_uploads;
    if (!u) {
      return {
        id: r.id,
        kind: "external",
        visible: r.visible,
        highlighted: r.highlighted,
        caption: r.caption,
        credit: r.credit,
        link_url: r.link_url,
        thumbnail_url: r.thumbnail_url,
        image_url: r.image_url,
        thumb: r.thumbnail_url ?? "",
        view: r.link_url ?? "",
        who: r.credit ?? "Photographer",
        deleted: false,
      };
    }
    // Visible uploads are shared, so Google serves their preview directly (and faster).
    const shared = r.visible && !u.deleted_at;
    return {
      id: r.id,
      kind: u.mime_type.startsWith("video/") ? "video" : "photo",
      visible: r.visible,
      highlighted: r.highlighted,
      caption: r.caption,
      credit: null,
      link_url: null,
      thumbnail_url: null,
      image_url: null,
      thumb: shared ? driveImage(u.drive_file_id, 400) : adminThumbnail(u),
      view: driveView(u.drive_file_id),
      who: uploader(u),
      deleted: Boolean(u.deleted_at),
    };
  });

  const pickable: PickableUpload[] = ((uploadData ?? []) as unknown as Upload[])
    // Test accounts' uploads were only for trying the uploader; they stay listed on /admin/media.
    .filter((u) => !inGallery.has(u.id) && !u.profiles?.is_test)
    .map((u) => ({
      id: u.id,
      kind: u.mime_type.startsWith("video/") ? "video" : "photo",
      thumb: adminThumbnail(u),
      view: driveView(u.drive_file_id),
      who: uploader(u),
      when: formatPacific(u.created_at),
    }));

  const shown = items.filter((i) => i.visible && !i.deleted).length;

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Gallery</h1>
        <p className="text-sm text-foreground/70">
          What <Link href="/gallery">/gallery</Link> shows, to everyone: {shown} shown, {items.length - shown} hidden or deleted. The page
          opens with a carousel of the highlighted (★) items, then has a section for videos, one for each photographer, and one for
          audience photos, each in the order below; drag or use the arrows to reorder. Adding an upload makes that one file viewable by anyone
          with its Drive link (the folder stays restricted); hiding or removing it makes it private again.
        </p>
      </section>

      <Arranger items={items} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add uploads</h2>
        <p className="text-sm text-foreground/70">
          Photos and videos from <Link href="/admin/media">Media</Link> that aren&apos;t in the gallery, newest first. Check the ones to show; double-click one, or use View, to open it in Drive.
        </p>
        <UploadPicker uploads={pickable} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add a photographer&apos;s photos</h2>
        <p className="text-sm text-foreground/70">
          Paste image links from the photographer&apos;s site, one photo per line. Clicking one on the page tells the visitor they&apos;re
          going to the photographer&apos;s site, then opens that photo there in a new tab, where they can download it.
        </p>
        <AddPhotographer credits={[...new Set(rows.map((r) => r.credit).filter((c): c is string => Boolean(c)))]} />
      </section>
    </div>
  );
}
