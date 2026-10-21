// LinkedIn profile URLs, from the profile form and from the Luma import (stored as typed).
// "linkedin.com/in/jane-doe/?utm=x" -> "https://www.linkedin.com/in/jane-doe"
// Anything that isn't a linkedin.com profile (/in/ or legacy /pub/) -> null, so we never
// show another site's link labeled "LinkedIn".
export function normalizeLinkedinUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;

  const match = url.pathname.match(/^\/(in|pub)\/([^/]+)/);
  if (!match) return null;
  return `https://www.linkedin.com/${match[1]}/${match[2]}`;
}
