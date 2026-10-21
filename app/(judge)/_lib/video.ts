// Demo video links: which hosts we accept, and how to embed them on the judge's entry page.
// Shared by the submit form (validation) and the judge view (embed). Safe in client code.

export type Video = {
  provider: "youtube" | "loom" | "vimeo" | "drive";
  id: string;
  // Rebuilt from the id, so checks and embeds never use the raw URL someone typed.
  canonicalUrl: string;
  embedUrl: string;
};

const ID = /^[A-Za-z0-9_-]{6,64}$/;

export const VIDEO_HOSTS_HINT = "YouTube, Loom, Vimeo, or a Google Drive file shared with anyone who has the link";

export function parseVideo(raw: string): Video | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let provider: Video["provider"] | null = null;
  let id: string | undefined;
  if (host === "youtube.com") {
    provider = "youtube";
    id = parts[0] === "watch" ? (url.searchParams.get("v") ?? undefined) : ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : undefined;
  } else if (host === "youtu.be") {
    provider = "youtube";
    id = parts[0];
  } else if (host === "loom.com" && (parts[0] === "share" || parts[0] === "embed")) {
    provider = "loom";
    id = parts[1];
  } else if (host === "vimeo.com") {
    provider = "vimeo";
    id = parts.find((p) => /^\d+$/.test(p));
  } else if (host === "drive.google.com" && parts[0] === "file" && parts[1] === "d") {
    provider = "drive";
    id = parts[2];
  }
  if (!provider || !id || !ID.test(id)) return null;

  switch (provider) {
    case "youtube":
      return { provider, id, canonicalUrl: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
    case "loom":
      return { provider, id, canonicalUrl: `https://www.loom.com/share/${id}`, embedUrl: `https://www.loom.com/embed/${id}` };
    case "vimeo":
      return { provider, id, canonicalUrl: `https://vimeo.com/${id}`, embedUrl: `https://player.vimeo.com/video/${id}` };
    case "drive":
      return { provider, id, canonicalUrl: `https://drive.google.com/file/d/${id}/view`, embedUrl: `https://drive.google.com/file/d/${id}/preview` };
  }
}
