// Photo and video types for uploads, shared by the upload form and the server action.
// Browsers sometimes report no type for iPhone files (.heic photos, .mov videos), so the file
// name's extension fills in.
const BY_EXTENSION: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  dng: "image/x-adobe-dng",
  tif: "image/tiff",
  tiff: "image/tiff",
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  avi: "video/x-msvideo",
  "3gp": "video/3gpp",
};

// The file's photo or video type, or null if it's neither.
export function mediaType(name: string, type: string) {
  if (/^(image|video)\//.test(type)) return type;
  return BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}
