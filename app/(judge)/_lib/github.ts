import "server-only";

// GitHub API calls for the judging app: the /submit repo check and the README for AI notes.
// Only https://api.github.com is fetched, with owner/repo parsed out of the submitted link, so a
// link can't make the server fetch any other host.
//
// GITHUB_TOKEN is optional. Without it GitHub allows 60 requests an hour per IP, shared by every
// function on Vercel's changing IPs; with it, 5,000 an hour for the token. Never log it.

const API = "https://api.github.com";
const MAX_REDIRECTS = 3;
const GITHUB_PART = /^[A-Za-z0-9_.-]{1,100}$/;

export function parseGitHubRepo(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.replace(/^www\./, "") !== "github.com") return null;
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  const name = repo?.replace(/\.git$/, "");
  if (!owner || !name || !GITHUB_PART.test(owner) || !GITHUB_PART.test(name)) return null;
  return { owner, repo: name };
}

// GET a path on the GitHub API. A renamed or transferred repo answers its old URL with a 301 to
// another api.github.com URL; follow those, and throw on a redirect anywhere else.
export async function githubFetch(path: string, accept: string, timeoutMs: number) {
  const headers: Record<string, string> = { Accept: accept, "User-Agent": "hack.claudeseattle.org" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const signal = AbortSignal.timeout(timeoutMs);

  let url = new URL(path, API);
  for (let hops = 0; ; hops++) {
    const res = await fetch(url, { headers, redirect: "manual", signal, cache: "no-store" });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    const next = location ? new URL(location, url) : null;
    if (!next || next.origin !== API || hops >= MAX_REDIRECTS) throw new Error("GitHub redirect not followed");
    url = next;
  }
}
