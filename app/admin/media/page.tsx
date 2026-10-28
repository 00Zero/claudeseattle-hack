import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";

// Photos and videos uploaded on /resources (media_uploads), newest first, with who uploaded each:
// two short lines and an Open button per file, so a phone shows many at once. The files live in
// the restricted Drive folder; the links open only for accounts that can see it.
// Deleted uploads stay listed with the time they were removed (their files are in Drive's trash).

type Upload = {
  id: string;
  profile_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  drive_file_id: string;
  created_at: string;
  deleted_at: string | null;
  profiles: { first_name: string; last_name: string } | null;
  teams: { name: string } | null;
};

const LIMIT = 2000;
const button = "shrink-0 rounded border border-foreground/20 px-3 py-1 text-xs hover:bg-foreground/5";

function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function MediaUploadsPage() {
  await requireAdminPage();
  const admin = createAdminClient();
  const { data } = await admin
    .from("media_uploads")
    .select("id, profile_id, file_name, mime_type, size_bytes, drive_file_id, created_at, deleted_at, profiles(first_name, last_name), teams(name)")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  const uploads = (data ?? []) as unknown as Upload[];

  const kept = uploads.filter((u) => !u.deleted_at);
  const photos = kept.filter((u) => u.mime_type.startsWith("image/")).length;
  const uploaders = new Set(kept.map((u) => u.profile_id)).size;
  const totalBytes = kept.reduce((sum, u) => sum + u.size_bytes, 0);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Media</h1>
        <p className="text-sm text-foreground/70">
          Photos and videos uploaded on <Link href="/resources#upload-media">/resources</Link>, newest first
          {uploads.length === LIMIT ? ` (latest ${LIMIT})` : ""}. Files open in the organizers&apos; Drive folder. Deleted ones are in that folder
          owner&apos;s Drive trash for 30 days.
        </p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["Files", kept.length],
            ["Photos", photos],
            ["Videos", kept.length - photos],
            ["Uploaders", uploaders],
            ["Total size", `${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`],
            ["Deleted", uploads.length - kept.length],
          ].map(([label, n]) => (
            <div key={label}>
              <dt className="inline text-foreground/70">{label}: </dt>
              <dd className="inline font-medium">{n}</dd>
            </div>
          ))}
        </dl>
      </section>

      {uploads.length === 0 ? (
        <p className="text-sm text-foreground/70">None yet.</p>
      ) : (
        <ul className="divide-y divide-foreground/10 border-y border-foreground/10 text-sm">
          {uploads.map((u) => (
            <li key={u.id} className={`flex items-center gap-3 py-1.5 ${u.deleted_at ? "text-foreground/50" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <span className="font-medium">{`${u.profiles?.first_name ?? ""} ${u.profiles?.last_name ?? ""}`.trim() || "Guest"}</span>
                  {u.teams && <span className="text-foreground/70"> · {u.teams.name}</span>}
                </div>
                <div className="truncate text-xs text-foreground/70">
                  {formatPacific(u.created_at)} · {u.mime_type.startsWith("image/") ? "Photo" : "Video"} · {megabytes(u.size_bytes)}
                </div>
              </div>
              {u.deleted_at ? (
                <span className="shrink-0 text-xs">Deleted {formatPacific(u.deleted_at)}</span>
              ) : (
                <a href={`https://drive.google.com/file/d/${u.drive_file_id}/view`} target="_blank" rel="noreferrer" className={button} title={u.file_name}>
                  Open
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
