import "server-only";

// Media uploads go to a restricted Google Drive folder through the Apps Script web app in
// scripts/apps-script/media-upload.gs (MEDIA_UPLOAD_URL), which runs as the folder's owner and
// checks MEDIA_UPLOAD_SECRET. The folder's ID lives only in the script's properties.

export const MEDIA_MAX_BYTES = 500 * 1024 * 1024;

export function isMediaType(mimeType: string) {
  return /^(image|video)\//.test(mimeType);
}

async function callScript<T>(body: Record<string, unknown>): Promise<T> {
  const url = process.env.MEDIA_UPLOAD_URL;
  const secret = process.env.MEDIA_UPLOAD_SECRET;
  if (!url || !secret) throw new Error("Media uploads aren't set up yet.");
  // Apps Script answers with a redirect to the result, which fetch follows.
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, secret }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Media upload script returned non-JSON", response.status, text.slice(0, 200));
    throw new Error("The upload service didn't answer. Try again in a minute.");
  }
  if (data.error) {
    console.error("Media upload script error", body.action, data.error);
    throw new Error(data.error);
  }
  return data;
}

// A one-time link the browser PUTs the file to. Google only accepts the upload from `origin`.
export async function startDriveUpload(file: { name: string; mimeType: string; size: number; origin: string }) {
  const { uploadUrl } = await callScript<{ uploadUrl: string }>({ action: "start", ...file });
  return uploadUrl;
}

// The file's details, if it's in the media folder; throws otherwise.
export async function checkDriveUpload(fileId: string) {
  return callScript<{ name: string; mimeType: string; size: number }>({ action: "check", fileId });
}
