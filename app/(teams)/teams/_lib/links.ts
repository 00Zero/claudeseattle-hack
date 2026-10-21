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

// GitHub usernames: letters, digits, and single hyphens, not at either end, up to 39
// characters. Accepts a pasted profile URL or "@name".
// "https://github.com/jane-doe/" -> "jane-doe"; anything else -> null.
const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function normalizeGithubUsername(value: string | null | undefined): string | null {
  const raw = value
    ?.trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return raw && GITHUB_USERNAME.test(raw) ? raw : null;
}
