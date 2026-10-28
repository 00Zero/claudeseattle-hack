import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";

// Photos and videos uploaded on /resources (media_uploads), newest first, with who uploaded each.
// The files live in the restricted Drive folder; the links open only for accounts that can see it.
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

function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function MediaUploadsPage() {
  await requireAdminPage();
  const admin = createAdminClient();
  const [{ data }, { data: emails }] = await Promise.all([
    admin
      .from("media_uploads")
      .select("id, profile_id, file_name, mime_type, size_bytes, drive_file_id, created_at, deleted_at, profiles(first_name, last_name), teams(name)")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    admin.from("profile_emails").select("profile_id, email").eq("is_default", true),
  ]);
  const uploads = (data ?? []) as unknown as Upload[];
  const emailOf = new Map((emails ?? []).map((e) => [e.profile_id as string, e.email as string]));

  const kept = uploads.filter((u) => !u.deleted_at);
  const photos = kept.filter((u) => u.mime_type.startsWith("image/")).length;
  const uploaders = new Set(kept.map((u) => u.profile_id)).size;
  const totalBytes = kept.reduce((sum, u) => sum + u.size_bytes, 0);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-foreground/20">
                <th className="py-2 pr-3 font-medium">Uploaded</th>
                <th className="py-2 pr-3 font-medium">By</th>
                <th className="py-2 pr-3 font-medium">Team</th>
                <th className="py-2 pr-3 font-medium">File</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className={`border-b border-foreground/10 align-top ${u.deleted_at ? "text-foreground/50" : ""}`}>
                  <td className="whitespace-nowrap py-2 pr-3">{formatPacific(u.created_at)}</td>
                  <td className="py-2 pr-3">
                    <div>{u.profiles ? `${u.profiles.first_name} ${u.profiles.last_name}`.trim() || "Guest" : "Unknown"}</div>
                    {emailOf.get(u.profile_id) && <div className="text-xs text-foreground/70">{emailOf.get(u.profile_id)}</div>}
                  </td>
                  <td className="py-2 pr-3">{u.teams?.name ?? "—"}</td>
                  <td className="break-all py-2 pr-3">
                    {u.deleted_at ? (
                      <>
                        <span className="line-through">{u.file_name}</span>
                        <div className="text-xs">Deleted {formatPacific(u.deleted_at)}</div>
                      </>
                    ) : (
                      <a href={`https://drive.google.com/file/d/${u.drive_file_id}/view`} target="_blank" rel="noreferrer" className="underline">
                        {u.file_name}
                      </a>
                    )}
                  </td>
                  <td className="py-2 pr-3">{u.mime_type.startsWith("image/") ? "Photo" : "Video"}</td>
                  <td className="whitespace-nowrap py-2">{megabytes(u.size_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
