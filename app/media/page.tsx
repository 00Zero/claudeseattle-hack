import { redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

// Photo and video uploads for approved attendees. Files go straight from the browser to a
// restricted Google Drive folder (see lib/media.ts); attendees never see the folder. The list
// shows only the viewer's own uploads (RLS on media_uploads).
export default async function MediaPage() {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  if (access === "blocked") redirect("/declined");

  if (access !== "full") {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Photos and videos</h1>
        <p>You can upload photos and videos from the event here once your registration is approved.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("media_uploads")
    .select("id, file_name, size_bytes, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const uploads = data ?? [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Photos and videos</h1>
        <p className="text-fg-muted">
          Share your photos and videos from the Claude Impact Lab Hackathon. They go to the event organizers; other attendees
          can&apos;t see them.
        </p>
      </div>
      <UploadForm />
      {uploads.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your uploads ({uploads.length})</h2>
          <ul className="divide-y divide-line rounded border border-line text-sm">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{u.file_name}</span>
                <span className="shrink-0 text-fg-muted">{(u.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
