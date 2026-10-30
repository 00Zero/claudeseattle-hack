import type { Metadata } from "next";
import { PageHeader } from "@/app/(judge)/_components/ui";
import { eventName } from "@/lib/event";
import { driveImage, type GalleryItem } from "@/lib/gallery";
import { indexed } from "@/lib/site";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { Gallery, UploadButton } from "./gallery";

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
  const [items, profile] = await Promise.all([getItems(), getCurrentProfile().catch(() => null)]);
  // Uploading needs an approved sign-in, which /resources checks; signed-out visitors sign in first.
  const uploadHref = profile ? "/resources#upload-media" : "/login?next=/resources%23upload-media";
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Claude Impact Lab · Seattle" title="Event" italic="gallery">
        <p>
          Photos and videos from the day. Click a photo to see it full size and download it, or a video to play it. The photographers&apos;
          shots open on their sites, where you can download them.
        </p>
      </PageHeader>
      {items.length === 0 ? (
        <div className="space-y-3">
          <p className="text-fg-muted">Photos are on their way. Were you there? Add yours.</p>
          <UploadButton href={uploadHref} />
        </div>
      ) : (
        <Gallery items={items} uploadHref={uploadHref} />
      )}
    </div>
  );
}
