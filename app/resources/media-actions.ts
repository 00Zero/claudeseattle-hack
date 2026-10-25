"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentAccess } from "@/lib/access";
import { checkDriveUpload, isMediaType, MEDIA_MAX_BYTES, startDriveUpload } from "@/lib/media";
import { getOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

// Approved attendees only, like the rest of /resources.
async function uploader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;
  if ((await getCurrentAccess()) !== "full") return null;
  const admin = createAdminClient();
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    admin.from("team_members").select("team_id, teams(name)").eq("profile_id", userId).eq("status", "member").maybeSingle(),
  ]);
  const team = membership?.teams as { name: string } | null | undefined;
  return { userId, teamId: membership?.team_id ?? null, label: team?.name ?? profile?.display_name ?? "Attendee" };
}

// Step 1: a one-time Google Drive upload link for one file. The file is saved in Drive as
// "<team or name> - <file name>" so the folder's owner can tell uploads apart.
export async function startMediaUpload(file: { name: string; type: string; size: number }): Promise<Result<{ uploadUrl: string }>> {
  const who = await uploader();
  if (!who) return { ok: false, message: "Log in with an approved registration to upload." };
  const name = String(file.name ?? "").trim().slice(0, 200);
  if (!name) return { ok: false, message: "The file needs a name." };
  if (!isMediaType(String(file.type ?? ""))) return { ok: false, message: `${name}: only photos and videos.` };
  if (!(file.size > 0 && file.size <= MEDIA_MAX_BYTES)) return { ok: false, message: `${name}: files must be under 500 MB.` };

  const origin = (await headers()).get("origin") ?? (await getOrigin());
  try {
    const uploadUrl = await startDriveUpload({ name: `${who.label} - ${name}`.slice(0, 250), mimeType: file.type, size: file.size, origin });
    return { ok: true, uploadUrl };
  } catch (error) {
    return { ok: false, message: `${name}: ${error instanceof Error ? error.message : "couldn't start the upload."}` };
  }
}

// Step 2, after the browser finished sending the file to Google: confirm it landed in the media
// folder and log it. A file can be logged once.
export async function recordMediaUpload(fileId: string): Promise<Result<object>> {
  const who = await uploader();
  if (!who) return { ok: false, message: "Log in with an approved registration to upload." };
  if (!/^[\w-]{10,100}$/.test(fileId)) return { ok: false, message: "That upload didn't finish. Try again." };

  let file: { name: string; mimeType: string; size: number };
  try {
    file = await checkDriveUpload(fileId);
  } catch {
    return { ok: false, message: "The upload finished but couldn't be confirmed. Try again." };
  }
  const { error } = await createAdminClient().from("media_uploads").insert({
    profile_id: who.userId,
    team_id: who.teamId,
    drive_file_id: fileId,
    file_name: file.name.slice(0, 300),
    mime_type: file.mimeType,
    size_bytes: file.size,
  });
  if (error && error.code !== "23505") {
    console.error("Media upload log failed", error.message);
    return { ok: false, message: "Uploaded, but it couldn't be logged. Tell an organizer." };
  }
  revalidatePath("/resources");
  return { ok: true };
}
