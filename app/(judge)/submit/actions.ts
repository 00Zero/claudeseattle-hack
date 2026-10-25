"use server";

import { revalidatePath } from "next/cache";
import { normalizeGithubUsername } from "@/app/(teams)/teams/_lib/links";
import { createClient } from "@/lib/supabase/server";
import { formatPacific } from "@/lib/time";
import { checkEntry, type Checklist } from "./_lib/checklist";
import { getSubmissionDeadline, getSubmitContext, LIMITS, type EntryLink, type EntryValues } from "./_lib/entry";
import { fieldList, FIELDS, loadSavedEntry, mergeValues, writeEntry, type SavedEntry } from "./_lib/merge";
import { loadPart, writeGithub, writePart, type Part } from "./_lib/parts";

// entry: the saved version after this save, or the teammate's version it conflicted with.
// confirm_late: the deadline has passed and the editor hasn't confirmed saving late yet.
// details: for an error, what happened and what to do, shown behind the message's info icon.
export type SaveState = { status: "idle" | "ok" | "late" | "confirm_late" | "error"; message?: string; details?: string[]; entry?: SavedEntry };

// What to do about an error, said the same way wherever it can happen.
const HELP = {
  signedOut: "You were signed out, so nothing was saved. Open this site in a new tab and log in, then come back to this tab and press Save: your text is still here.",
  noAccess: "Only approved participants can save. Ask an organizer at the front desk to approve your registration, or ask a teammate to save.",
  blocked: "Only participants on this team can save its entry. If that's wrong, find an organizer.",
  stale: "This page is out of date, usually because the site was just updated. Copy anything you typed somewhere safe, reload the page, paste it back, and save.",
  retry: "The database didn't take the save. Wait a few seconds and press Save again. If it keeps failing, find an organizer, and don't close this tab: your text is only here.",
  closed: "Submissions closed at the deadline, so this can't change now. If something important is missing, find an organizer.",
} as const;

function failed(message: string, ...details: string[]): SaveState {
  return { status: "error", message, details };
}

const CONFIRM_LATE: SaveState = {
  status: "confirm_late",
  message: "Submissions closed. Saving now marks your project as submitted late.",
};

function text(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// http(s) only; anything else (javascript:, data:) would be unsafe to render as a link.
function isWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseLinks(formData: FormData): EntryLink[] | SaveState {
  const labels = formData.getAll("link_label");
  const urls = formData.getAll("link_url");
  const links: EntryLink[] = [];
  for (let i = 0; i < Math.min(urls.length, LIMITS.links); i++) {
    const url = typeof urls[i] === "string" ? (urls[i] as string).trim().slice(0, LIMITS.url) : "";
    const label = typeof labels[i] === "string" ? (labels[i] as string).trim().slice(0, LIMITS.linkLabel) : "";
    if (!url) continue;
    if (!isWebUrl(url)) {
      return failed(`“${url}” isn't a web link.`, "Links under “Other links” need the full address, starting with https://. Copy it from your browser's address bar, or remove that row.");
    }
    links.push({ label: label || url, url });
  }
  return links;
}

// The saved version the form last had, sent as JSON so the save can tell the editor's changes
// from fields they left alone.
function parseBase(formData: FormData): EntryValues | null {
  try {
    const raw = JSON.parse(String(formData.get("base")));
    const ok = FIELDS.every((field) => (field === "links" ? Array.isArray(raw[field]) : typeof raw[field] === "string"));
    return ok ? (raw as EntryValues) : null;
  } catch {
    return null;
  }
}

function invalid(values: EntryValues): SaveState | null {
  if (!values.title) return failed("Give your project a title.", "The title is required: add it at the top of the form, then save.");
  // docs/REQUIREMENTS.md: demo video and repo are required. Whether they load is the checklist's job.
  if (!values.video_url) {
    return failed(
      "Add a link to your demo video.",
      "The entry can't save without a demo video link. Upload it to YouTube (unlisted is fine), Loom, Vimeo, or Google Drive, paste the link, and save. You can replace it any time before the deadline.",
    );
  }
  if (!values.repo_url) {
    return failed(
      "Add your GitHub repo link.",
      "The entry can't save without a repo link, like https://github.com/your-org/your-repo. You can push more code after saving; judges need the repo to be public.",
    );
  }
  for (const key of ["video_url", "repo_url"] as const) {
    if (!isWebUrl(values[key])) {
      const name = key === "video_url" ? "demo video" : "repo";
      return failed(`The ${name} link should start with https://.`, `Paste the ${name}'s full address, copied from your browser's address bar.`);
    }
  }
  return null;
}

// judge_entries' columns for the form's values. The one description goes in description_long, and
// description_short is cleared so an older entry's short text isn't shown twice.
function entryRow(values: EntryValues) {
  return {
    title: values.title,
    tagline: values.tagline || null,
    description_short: null,
    description_long: values.description || null,
    video_url: values.video_url || null,
    repo_url: values.repo_url || null,
    links: values.links,
    contributions: values.contributions || null,
  };
}

// Save the caller's team entry. Before the deadline it writes judge_entries (RLS: a team member
// who may submit, and judge_submissions_open()); a trigger stamps who saved and when. After the
// deadline the save is kept in judge_late_saves for an organizer to accept or reject.
//
// Teammates edit the same entry, so the save merges field by field with what's saved now: fields
// this editor didn't change keep teammates' saves. If a teammate changed the same field since the
// editor's form last had it, the save is refused and the form shows both versions.
export async function saveEntry(formData: FormData): Promise<SaveState> {
  const ctx = await getSubmitContext();
  if (ctx.kind === "signed_out") return failed("Your session expired.", HELP.signedOut);
  if (ctx.kind === "no_access") return failed("Your registration is awaiting approval.", HELP.noAccess);
  if (ctx.kind === "blocked") return failed(ctx.reason, HELP.blocked);

  const links = parseLinks(formData);
  if (!Array.isArray(links)) return links;
  const base = parseBase(formData);
  if (!base) return failed("This page is out of date.", HELP.stale);

  const mine: EntryValues = {
    title: text(formData, "title", LIMITS.title),
    tagline: text(formData, "tagline", LIMITS.tagline),
    description: text(formData, "description", LIMITS.description),
    video_url: text(formData, "video_url", LIMITS.url),
    repo_url: text(formData, "repo_url", LIMITS.url),
    links,
    contributions: text(formData, "contributions", LIMITS.contributions),
  };

  const supabase = await createClient();
  const teamId = ctx.team.id;

  // After the deadline, keep the save for an organizer instead of losing it.
  async function saveLate(values: EntryValues, checklist: Checklist): Promise<SaveState> {
    // In judge_entries' columns: accepting it copies them onto the entry.
    const { error } = await supabase
      .from("judge_late_saves")
      .insert({ team_id: teamId, payload: { ...entryRow(values), checklist } });
    if (error) return failed("We couldn't save your changes.", HELP.retry);
    revalidatePath("/submit");
    return {
      status: "late",
      message: "Saved, and marked as submitted late. An organizer will accept or reject it.",
    };
  }

  // After the deadline the editor confirms first (the form asks), then the save is kept as is:
  // there's no merging with the on-time entry, since the form started from the team's latest save.
  const confirmedLate = formData.get("confirm_late") === "yes";
  if (ctx.isPast) {
    if (!confirmedLate) return CONFIRM_LATE;
    const problem = invalid(mine);
    if (problem) return problem;
    return saveLate(mine, await checkEntry(mine, ctx.entry));
  }

  let current: SavedEntry | null = ctx.entry
    ? { values: ctx.entry, savedAt: ctx.entry.last_saved_at, savedBy: ctx.entry.last_saved_by_name }
    : null;
  // The write only lands if nobody saved since `current` was read. If someone did (the link checks
  // take a few seconds), merge with their save and try again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { values, conflicts, kept } = current ? mergeValues(base, mine, current.values) : { values: mine, conflicts: [], kept: [] };
    const problem = invalid(values);
    if (problem) return problem;
    const who = current?.savedBy ?? "A teammate";
    if (current && conflicts.length) {
      return {
        ...failed(
          `${who} also changed ${fieldList(conflicts)}${current.savedAt ? ` at ${formatPacific(current.savedAt)}` : ""}, so the entry didn't save.`,
          `A teammate saved the same ${conflicts.length === 1 ? "field" : "fields"} while you were editing. Nothing you typed is lost: under ${conflicts.length === 1 ? "that field" : "each of those fields"} there's an orange box. Open “Show their version”, choose Use theirs or Keep mine, then press Save again.`,
        ),
        entry: current,
      };
    }

    const checklist = await checkEntry(values, ctx.entry);

    const { saved, error } = await writeEntry(supabase, teamId, current, { ...entryRow(values), checklist });
    if (saved) {
      revalidatePath("/submit");
      const missing = checklist.items.filter((item) => item.required && item.status !== "ok").length;
      const status = missing ? `Saved. ${missing} required item${missing === 1 ? " still needs" : "s still need"} fixing.` : "Saved. Everything judges need is there.";
      return { status: "ok", message: kept.length ? `${status} Kept ${who}'s changes to ${fieldList(kept)}.` : status, entry: saved };
    }
    // The deadline passed while this save was running, so RLS refused it: store it as a late save
    // rather than dropping it.
    if ((await getSubmissionDeadline()).isPast) return confirmedLate ? saveLate(values, checklist) : CONFIRM_LATE;
    // 23505: a teammate created the entry first. No error: a teammate saved since `current`.
    if (error && error.code !== "23505") return failed("We couldn't save the entry.", HELP.retry);
    current = await loadSavedEntry(supabase, teamId);
  }
  return failed("Teammates are saving at the same moment.", "Several people pressed Save within a few seconds, and the entry kept changing underneath this save. Wait a few seconds, then press Save again.");
}

// One teammate's edited part, as the form sends it: base_at is when the version it started from
// was saved (null = never written).
export type PartEdit = { profile_id: string; body: string; base_at: string | null };

// ok: saved (part is the new version). conflict: someone saved it since the form had it (part is
// theirs, by is their name). error: not saved (message says why, detail what to do).
export type PartResult = { profile_id: string; status: "ok" | "conflict" | "error"; part?: Part; by?: string; message?: string; detail?: string };

// PartState: what a GitHub username add returns; details as in SaveState.
export type PartState = { status: "idle" | "ok" | "error"; message?: string; details?: string[] };

// Save teammates' "who did what" parts (judge_contributions; RLS: a team member who may submit,
// before the deadline). Anyone on the team can write anyone's part. Each part is written on its
// own and only if nobody saved it since the form last had it; otherwise the form shows both
// versions to pick from, so nobody's writing is lost. The form calls this alongside saveEntry.
export async function saveContributions(edits: PartEdit[]): Promise<PartResult[]> {
  const ctx = await getSubmitContext();
  const refuse = (message: string, detail: string) => edits.map((e) => ({ profile_id: e.profile_id, status: "error" as const, message, detail }));
  if (ctx.kind === "signed_out") return refuse("Your session expired.", HELP.signedOut);
  if (ctx.kind === "no_access") return refuse("Your registration is awaiting approval.", HELP.noAccess);
  if (ctx.kind !== "ready") return refuse("You can't edit this team's entry.", HELP.blocked);
  if (ctx.isPast) return refuse("Submissions closed, so who did what can't change now.", HELP.closed);

  const supabase = await createClient();
  const results = await Promise.all(
    edits.slice(0, 20).map(async (edit): Promise<PartResult> => {
      const teammate = ctx.teammates.find((t) => t.id === edit.profile_id);
      if (!teammate) {
        return {
          profile_id: edit.profile_id,
          status: "error",
          message: "Someone in who did what isn't on your team anymore.",
          detail: "They left the team or were removed after this page loaded. Reload the page to see the current team; copy anything you wrote for them first.",
        };
      }
      const body = String(edit.body ?? "").trim().slice(0, LIMITS.contribution);
      const baseAt = typeof edit.base_at === "string" && edit.base_at ? edit.base_at : null;
      const { saved, failed: writeFailed } = await writePart(supabase, ctx.team.id, teammate.id, baseAt, body);
      if (writeFailed) return { profile_id: teammate.id, status: "error", message: `We couldn't save ${teammate.name}'s part.`, detail: HELP.retry };
      if (saved) return { profile_id: teammate.id, status: "ok", part: saved };
      const current = await loadPart(supabase, ctx.team.id, teammate.id);
      return { profile_id: teammate.id, status: "conflict", part: current, by: ctx.teammates.find((t) => t.id === current.by)?.name ?? "A teammate" };
    }),
  );
  if (results.some((r) => r.status === "ok")) revalidatePath("/submit");
  return results;
}

// Add a GitHub username for a teammate whose profile has none. It's kept on the team's
// judge_contributions row (RLS: a team member who may submit, before the deadline), so profiles
// stays edited only by its owner.
export async function setTeammateGithub(formData: FormData): Promise<PartState> {
  const ctx = await getSubmitContext();
  const nope = (message: string, detail: string): PartState => ({ status: "error", message, details: [detail] });
  if (ctx.kind === "signed_out") return nope("Your session expired.", HELP.signedOut);
  if (ctx.kind !== "ready") return nope("You can't edit this team's entry.", HELP.blocked);
  if (ctx.isPast) return nope("Submissions closed.", HELP.closed);
  const teammate = ctx.teammates.find((t) => t.id === formData.get("profile_id"));
  if (!teammate) return nope("That person isn't on your team anymore.", "They left the team or were removed after this page loaded. Reload the page to see the current team.");
  if (teammate.github) return nope(`${teammate.name} already has a GitHub username.`, "Someone added it after this page loaded. Reload the page to see it.");

  const raw = text(formData, "github", 300);
  const github = normalizeGithubUsername(raw);
  if (!github) {
    return nope(
      raw ? `“${raw}” isn't a GitHub username.` : "Add a GitHub username.",
      "Use just the username (like octocat) or the profile link (github.com/octocat). Usernames have only letters, numbers, and dashes. Ask your teammate, or find them on github.com.",
    );
  }
  if (!(await writeGithub(await createClient(), ctx.team.id, teammate.id, github))) {
    return nope("We couldn't save it.", HELP.retry);
  }
  revalidatePath("/submit");
  return { status: "ok", message: `Added @${github}.` };
}
