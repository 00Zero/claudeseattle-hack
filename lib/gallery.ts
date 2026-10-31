import { parseVideo } from "@/app/(judge)/_lib/video";

// The /gallery page's items (public_gallery, in *_shared_gallery.sql) and the Google links for
// uploads. An upload in the gallery is shared to anyone with its link, so Google serves its
// thumbnail, the full photo, the download and the video player; these links need no sign-in.

export type GalleryKind = "photo" | "video" | "external";

export type GalleryItem = {
  id: string;
  highlighted: boolean;
  highlight_position: number | null;
  caption: string | null;
  credit: string | null;
  kind: GalleryKind;
  thumbnail_url: string | null;
  image_url: string | null;
  link_url: string | null;
  drive_file_id: string | null;
  youtube_id: string | null;
};

// public_gallery exposes only what the page may show.
export const GALLERY_COLUMNS = "*";

// The carousel's items, in the order set on /admin/gallery. A list sort is stable, so items with no
// carousel position keep their order after the others.
export function carouselItems<T extends { highlighted: boolean; highlight_position: number | null }>(items: T[]) {
  const rank = (item: T) => item.highlight_position ?? Number.MAX_SAFE_INTEGER;
  return items.filter((i) => i.highlighted).sort((a, b) => rank(a) - rank(b));
}

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

// Drive's own player: it can't autoplay or say when a video ends, and on iPhones its controls sit on
// top of Safari's. It's the fallback for driveStream.
export function drivePlayer(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

// A video file for our own <video> tag. Drive's download links refuse video requests from other
// sites, but its API serves a file shared by link. The key is in the browser by design; Google
// Cloud limits it to the Drive API on our sites.
export function driveStream(fileId: string) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY;
  return key ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(key)}` : null;
}

// The id from a YouTube link in any of its forms, or null if it isn't one.
export function youtubeIdFrom(link: string) {
  const video = parseVideo(link);
  return video?.provider === "youtube" ? video.id : null;
}

export function youtubeWatch(id: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

// Starts when opened: the click that opened it lets the player autoplay. rel=0 keeps suggestions to
// the same channel.
export function youtubePlayer(id: string) {
  return `${parseVideo(youtubeWatch(id))?.embedUrl}?autoplay=1&rel=0&playsinline=1`;
}

// hqdefault exists for every video; the larger sizes don't.
export function youtubeThumbnail(id: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

// Uploads and YouTube videos open in the page's viewer; photographers' photos open on their site.
export function opensInViewer(item: GalleryItem) {
  return item.kind !== "external" && Boolean(item.drive_file_id || item.youtube_id);
}

// Where the thumbnail links without JavaScript, and for a middle-click or a new tab.
export function itemHref(item: GalleryItem) {
  if (item.kind === "external") return item.link_url ?? "#";
  if (item.youtube_id) return youtubeWatch(item.youtube_id);
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
