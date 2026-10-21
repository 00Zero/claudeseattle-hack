import "server-only";
import { parseVideo, VIDEO_HOSTS_HINT } from "../../_lib/video";
import type { EntryValues } from "./entry";

// docs/REQUIREMENTS.md, "Judging app": on every save, check required fields, that the repo is
// public, and that the video loads, and show the team a checklist so they fix it before 5:30.
//
// Network checks only call fixed hosts (the GitHub API and the video providers' oEmbed
// endpoints) with ids parsed out of the link, never the URL someone typed, so a submitted link
// can't make the server fetch an arbitrary or internal address.

export type CheckStatus = "ok" | "fail" | "warn";
export type CheckItem = { key: string; label: string; required: boolean; status: CheckStatus; detail?: string };
export type Checklist = { checkedAt: string; items: CheckItem[] };

const TIMEOUT_MS = 4000;

async function get(url: string, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    return { status: res.status, json: res.ok ? await res.json().catch(() => null) : null };
  } catch {
    return { status: 0, json: null };
  }
}

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

async function checkRepo(raw: string): Promise<CheckItem> {
  const base = { key: "repo", label: "Repo is a public GitHub repository", required: true };
  if (!raw) return { ...base, status: "fail", detail: "Add your GitHub repo link." };
  const parsed = parseGitHubRepo(raw);
  if (!parsed) return { ...base, status: "fail", detail: "Use a link like https://github.com/your-org/your-repo." };

  const { status, json } = await get(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
    Accept: "application/vnd.github+json",
    "User-Agent": "hack.claudeseattle.org",
  });
  if (status === 200 && json?.private === false) {
    const empty = json?.size === 0;
    return empty
      ? { ...base, status: "warn", detail: "The repo is public but empty. Push your code before 5:30." }
      : { ...base, status: "ok" };
  }
  if (status === 404) return { ...base, status: "fail", detail: "GitHub can't find it. Check the link and make the repo public." };
  if (status === 200) return { ...base, status: "fail", detail: "The repo is private. Make it public so judges can open it." };
  // Rate limited (403/429) or GitHub unreachable: don't mark the team wrong for our problem.
  return { ...base, status: "warn", detail: "We couldn't reach GitHub to check. Open the link logged out to be sure." };
}

async function checkVideo(raw: string): Promise<CheckItem> {
  const base = { key: "video", label: "Demo video loads", required: true };
  if (!raw) return { ...base, status: "fail", detail: "Add a link to your demo video." };
  const video = parseVideo(raw);
  if (!video) return { ...base, status: "fail", detail: `Use ${VIDEO_HOSTS_HINT}.` };

  const target = encodeURIComponent(video.canonicalUrl);
  const oembed = {
    youtube: `https://www.youtube.com/oembed?format=json&url=${target}`,
    loom: `https://www.loom.com/v1/oembed?url=${target}`,
    vimeo: `https://vimeo.com/api/oembed.json?url=${target}`,
    drive: null,
  }[video.provider];
  if (!oembed) {
    return { ...base, status: "warn", detail: "We can't check Drive files. Set sharing to “Anyone with the link” and test it logged out." };
  }

  const { status } = await get(oembed);
  if (status === 200) return { ...base, status: "ok" };
  // YouTube and Loom answer 400 for an id that doesn't exist; 401/403 is private or not embeddable.
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return { ...base, status: "fail", detail: "The video is private or doesn't exist. Make it public or unlisted." };
  }
  return { ...base, status: "warn", detail: "We couldn't reach the video site to check. Open the link logged out to be sure." };
}

function filled(key: string, label: string, value: string, required: boolean, hint: string): CheckItem {
  return value ? { key, label, required, status: "ok" } : { key, label, required, status: required ? "fail" : "warn", detail: hint };
}

export async function checkEntry(values: EntryValues): Promise<Checklist> {
  const [repo, video] = await Promise.all([checkRepo(values.repo_url), checkVideo(values.video_url)]);
  return {
    checkedAt: new Date().toISOString(),
    items: [
      filled("title", "Title", values.title, true, "Add a title."),
      filled("tagline", "One-line tagline", values.tagline, false, "A one-liner helps judges skim."),
      filled("description_short", "Short description", values.description_short, true, "Say what it does and for which small business."),
      filled("description_long", "Long description", values.description_long, false, "Cover the problem, how it works, and how a business sets it up."),
      video,
      repo,
    ],
  };
}
