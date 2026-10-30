// The /gallery page's items (public_gallery, in *_shared_gallery.sql) and the Google links for
// uploads. An upload in the gallery is shared to anyone with its link, so Google serves its
// thumbnail, the full photo, the download and the video player; these links need no sign-in.

export type GalleryKind = "photo" | "video" | "external";

export type GalleryItem = {
  id: string;
  highlighted: boolean;
  caption: string | null;
  credit: string | null;
  kind: GalleryKind;
  thumbnail_url: string | null;
  image_url: string | null;
  link_url: string | null;
  drive_file_id: string | null;
};

// The public_gallery columns the page reads, in GalleryItem's shape.
export const GALLERY_COLUMNS = "id, highlighted, caption, credit, kind, thumbnail_url, image_url, link_url, drive_file_id";

// width in CSS pixels; Drive converts .heic and other photo formats to JPEG for these.
export function driveImage(fileId: string, width: number) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

export function driveView(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

// The original file. confirm=t skips Drive's "can't scan this for viruses" page for files over 100 MB.
export function driveDownload(fileId: string) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

// Drive's own player, for videos the browser can't play straight from the file.
export function drivePlayer(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

// Where the thumbnail links without JavaScript, and for a middle-click or a new tab.
export function itemHref(item: GalleryItem) {
  if (item.kind === "external") return item.link_url ?? "#";
  return item.drive_file_id ? driveView(item.drive_file_id) : "#";
}

// The page's sections, in this order: videos, one per photographer (in the order their first
// photo appears), then audience photos. Items keep their order within a section.
export function gallerySections<T extends { kind: GalleryKind; credit: string | null }>(items: T[]) {
  type Section = { key: string; title: string; credit: string | null; items: T[] };
  const photographers: Section[] = [];
  for (const item of items) {
    if (item.kind !== "external") continue;
    const credit = item.credit ?? "Photographer";
    const section = photographers.find((s) => s.credit === credit);
    if (section) section.items.push(item);
    else photographers.push({ key: `external:${credit}`, title: `Photos by ${credit}`, credit, items: [item] });
  }
  const sections: Section[] = [
    { key: "video", title: "Videos", credit: null, items: items.filter((i) => i.kind === "video") },
    ...photographers,
    { key: "photo", title: "Audience photos", credit: null, items: items.filter((i) => i.kind === "photo") },
  ];
  return sections.filter((s) => s.items.length > 0);
}

// A photographer's gallery page: one of their photo links without the photo's query string.
export function galleryHome(link: string | null) {
  try {
    const url = new URL(link ?? "");
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}
