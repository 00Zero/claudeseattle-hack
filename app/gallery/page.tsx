import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/(judge)/_components/ui";
import { eventName } from "@/lib/event";
import { driveImage, type GalleryItem } from "@/lib/gallery";
import { indexed } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { Gallery } from "./gallery";

const description = `Photos and videos from ${eventName} in Seattle: recap videos, photos from the audience, and the event photographers' shots.`;

async function getItems() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_gallery")
    .select("id, highlighted, caption, credit, kind, thumbnail_url, image_url, link_url, drive_file_id")
    .order("position")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as GalleryItem[];
}

// Indexed, with the first highlighted photo as the link preview (the site's image otherwise).
export async function generateMetadata(): Promise<Metadata> {
  const first = (await getItems().catch(() => [])).find((i) => i.highlighted && i.kind !== "video");
  const image = first && (first.kind === "external" ? (first.image_url ?? first.thumbnail_url) : driveImage(first.drive_file_id ?? "", 1200));
  return {
    title: "Gallery",
    description,
    alternates: { canonical: "/gallery" },
    robots: indexed,
    openGraph: { title: `Gallery · ${eventName}`, description, ...(image ? { images: [image] } : {}) },
  };
}

// /gallery: public. Highlights, then videos, each photographer's photos and audience photos
// (uploaded on /resources), as arranged on /admin/gallery. Hidden items and deleted uploads never
// reach the page.
export default async function GalleryPage() {
  const items = await getItems();
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Claude Impact Lab · Seattle" title="Event" italic="gallery">
        <p>
          Photos and videos from the day. Click a photo to see it full size and download it, or a video to play it. The photographers&apos;
          shots open on their sites, where you can download them.
        </p>
      </PageHeader>
      {items.length === 0 ? (
        <p className="text-fg-muted">
          Photos are on their way. Were you there? Upload yours on <Link href="/resources#upload-media">/resources</Link>.
        </p>
      ) : (
        <Gallery items={items} />
      )}
    </div>
  );
}
