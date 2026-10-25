import "server-only";
import { githubFetch, parseGitHubRepo } from "../../_lib/github";
import { parseVideo, VIDEO_HOSTS_HINT } from "../../_lib/video";
import type { EntryValues } from "./entry";

// docs/REQUIREMENTS.md, "Judging app": on every save, check required fields, that the repo is
// public, and that the video loads, and show the team a checklist so they fix it before 5:30.
//
// Network checks only call fixed hosts (the GitHub API and the video providers' oEmbed
// endpoints) with ids parsed out of the link, never the URL someone typed, so a submitted link
// can't make the server fetch an arbitrary or internal address.

export type CheckStatus = "ok" | "fail" | "warn";
// checkedAt is set only on a passing repo check (see recentRepoPass).
export type CheckItem = { key: string; label: string; required: boolean; status: CheckStatus; detail?: string; checkedAt?: string };
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

async function getRepo(owner: string, repo: string) {
  try {
    const res = await githubFetch(`/repos/${owner}/${repo}`, "application/vnd.github+json", TIMEOUT_MS);
    return { status: res.status, json: res.ok ? await res.json().catch(() => null) : null };
  } catch {
    return { status: 0, json: null };
  }
}

// A passing repo check is reused for a while when the link hasn't changed, so a team saving every
// few minutes before 5:30 doesn't spend GitHub's rate limit on the same answer. It's read from the
// entry's stored checklist rather than an in-memory cache: the save already loads it, and Vercel
// instances don't share memory. The repo item keeps the time of its own GitHub call, so reuse
// can't extend itself save after save. Failures and warnings are never reused, so a team that just
// made its repo public is rechecked on the next save.
const REPO_RECHECK_MS = 10 * 60 * 1000;
export type PreviousCheck = { repo_url: string; checklist: Checklist | null } | null;

function repoKey(raw: string) {
  const parsed = parseGitHubRepo(raw);
  return parsed && `${parsed.owner}/${parsed.repo}`.toLowerCase();
}

function recentRepoPass(raw: string, previous: PreviousCheck): CheckItem | null {
  const item = previous?.checklist?.items.find((i) => i.key === "repo");
  if (!previous || item?.status !== "ok" || !item.checkedAt) return null;
  const key = repoKey(raw);
  if (!key || key !== repoKey(previous.repo_url)) return null;
  const age = Date.now() - Date.parse(item.checkedAt);
  return age >= 0 && age < REPO_RECHECK_MS ? item : null;
}

async function checkRepo(raw: string): Promise<CheckItem> {
  const base = { key: "repo", label: "Repo is a public GitHub repository", required: true };
  if (!raw) return { ...base, status: "fail", detail: "Add your GitHub repo link." };
  const parsed = parseGitHubRepo(raw);
  if (!parsed) return { ...base, status: "fail", detail: "Use a link like https://github.com/your-org/your-repo." };

  const { status, json } = await getRepo(parsed.owner, parsed.repo);
  if (status === 200 && json?.private === false) {
    const empty = json?.size === 0;
    return empty
      ? { ...base, status: "warn", detail: "The repo is public but empty. Push your code before 5:30." }
      : { ...base, status: "ok", checkedAt: new Date().toISOString() };
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

// previous: the entry as last saved, to reuse a recent passing repo check.
export async function checkEntry(values: EntryValues, previous: PreviousCheck = null): Promise<Checklist> {
  const [repo, video] = await Promise.all([
    recentRepoPass(values.repo_url, previous) ?? checkRepo(values.repo_url),
    checkVideo(values.video_url),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    items: [
      filled("title", "Title", values.title, true, "Add a title."),
      filled("tagline", "One-line tagline", values.tagline, false, "A one-liner helps judges skim."),
      filled("description", "Description", values.description, true, "Cover the problem, the small business, how it works, and how a business sets it up."),
      video,
      repo,
    ],
  };
}
