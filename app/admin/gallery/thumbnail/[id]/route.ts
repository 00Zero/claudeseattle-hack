import { getAdminProfile } from "@/lib/admin";
import { driveThumbnail } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";

// Admins only: Drive's small preview of an upload (by media_uploads.id), so /admin/gallery can
// show uploads that aren't shared yet. Kept in the admin's browser cache for a day.
export async function GET(_request: Request, { params }: RouteContext<"/admin/gallery/thumbnail/[id]">) {
  if (!(await getAdminProfile())) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const { data } = await createAdminClient().from("media_uploads").select("drive_file_id").eq("id", id).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  try {
    const thumbnail = await driveThumbnail(data.drive_file_id);
    if (!thumbnail) return new Response("No preview yet", { status: 404 });
    return new Response(new Uint8Array(thumbnail.bytes), {
      headers: { "Content-Type": thumbnail.mimeType, "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return new Response("Preview unavailable", { status: 502 });
  }
}
