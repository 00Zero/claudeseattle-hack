"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatPacific } from "@/lib/time";
import { checkEntry, type Checklist } from "./_lib/checklist";
import { getSubmissionDeadline, getSubmitContext, LIMITS, type EntryLink, type EntryValues } from "./_lib/entry";
import { fieldList, FIELDS, loadSavedEntry, mergeValues, writeEntry, type SavedEntry } from "./_lib/merge";

// entry: the saved version after this save, or the teammate's version it conflicted with.
export type SaveState = { status: "idle" | "ok" | "late" | "error"; message?: string; entry?: SavedEntry };

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

function parseLinks(formData: FormData): EntryLink[] | string {
  const labels = formData.getAll("link_label");
  const urls = formData.getAll("link_url");
  const links: EntryLink[] = [];
  for (let i = 0; i < Math.min(urls.length, LIMITS.links); i++) {
    const url = typeof urls[i] === "string" ? (urls[i] as string).trim().slice(0, LIMITS.url) : "";
    const label = typeof labels[i] === "string" ? (labels[i] as string).trim().slice(0, LIMITS.linkLabel) : "";
    if (!url) continue;
    if (!isWebUrl(url)) return `“${url}” isn't a web link. Links start with https://.`;
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

function invalid(values: EntryValues) {
  if (!values.title) return "Give your project a title.";
  // docs/REQUIREMENTS.md: demo video and repo are required. Whether they load is the checklist's job.
  if (!values.video_url) return "Add a link to your demo video. You can update it any time before the deadline.";
  if (!values.repo_url) return "Add your GitHub repo link. You can update it any time before the deadline.";
  for (const key of ["video_url", "repo_url"] as const) {
    if (!isWebUrl(values[key])) return `The ${key === "video_url" ? "demo video" : "repo"} link should start with https://.`;
  }
  return null;
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
  if (ctx.kind === "signed_out") return { status: "error", message: "Your session expired. Log in again." };
  if (ctx.kind === "no_access") return { status: "error", message: "Your registration is awaiting approval." };
  if (ctx.kind === "blocked") return { status: "error", message: ctx.reason };

  const links = parseLinks(formData);
  if (typeof links === "string") return { status: "error", message: links };
  const base = parseBase(formData);
  if (!base) return { status: "error", message: "Something went wrong. Reload the page and save again." };

  const mine: EntryValues = {
    title: text(formData, "title", LIMITS.title),
    tagline: text(formData, "tagline", LIMITS.tagline),
    description_short: text(formData, "description_short", LIMITS.description_short),
    description_long: text(formData, "description_long", LIMITS.description_long),
    video_url: text(formData, "video_url", LIMITS.url),
    repo_url: text(formData, "repo_url", LIMITS.url),
    links,
    contributions: text(formData, "contributions", LIMITS.contributions),
  };

  const supabase = await createClient();
  const teamId = ctx.team.id;

  // After the deadline, keep the save for an organizer instead of losing it.
  async function saveLate(values: EntryValues, checklist: Checklist): Promise<SaveState> {
    const { error } = await supabase
      .from("judge_late_saves")
      .insert({ team_id: teamId, payload: { ...values, checklist } });
    if (error) return { status: "error", message: "We couldn't save your changes. Find an organizer." };
    revalidatePath("/submit");
    return {
      status: "late",
      message: "Submissions closed, so this save is marked late. An organizer will accept or reject it.",
    };
  }

  let current: SavedEntry | null = ctx.entry
    ? { values: ctx.entry, savedAt: ctx.entry.last_saved_at, savedBy: ctx.entry.last_saved_by_name }
    : null;
  // The write only lands if nobody saved since `current` was read. If someone did (the link checks
  // take a few seconds), merge with their save and try again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { values, conflicts, kept } = current ? mergeValues(base, mine, current.values) : { values: mine, conflicts: [], kept: [] };
    const problem = invalid(values);
    if (problem) return { status: "error", message: problem };
    const who = current?.savedBy ?? "A teammate";
    if (current && conflicts.length && !ctx.isPast) {
      return {
        status: "error",
        message: `${who} also changed ${fieldList(conflicts)}${current.savedAt ? ` at ${formatPacific(current.savedAt)}` : ""}, so your save didn't go through. Your edits are still here: pick a version under ${conflicts.length === 1 ? "that field" : "each of those fields"}, then save again.`,
        entry: current,
      };
    }

    const checklist = await checkEntry(values, ctx.entry);
    if (ctx.isPast) return saveLate(values, checklist);

    const { saved, error } = await writeEntry(supabase, teamId, current, {
      title: values.title,
      tagline: values.tagline || null,
      description_short: values.description_short || null,
      description_long: values.description_long || null,
      video_url: values.video_url || null,
      repo_url: values.repo_url || null,
      links: values.links,
      contributions: values.contributions || null,
      checklist,
    });
    if (saved) {
      revalidatePath("/submit");
      const missing = checklist.items.filter((item) => item.required && item.status !== "ok").length;
      const status = missing ? `Saved. ${missing} required item${missing === 1 ? " still needs" : "s still need"} fixing.` : "Saved. Everything judges need is there.";
      return { status: "ok", message: kept.length ? `${status} Kept ${who}'s changes to ${fieldList(kept)}.` : status, entry: saved };
    }
    // The deadline passed while this save was running, so RLS refused it: store it as a late save
    // rather than dropping it.
    if ((await getSubmissionDeadline()).isPast) return saveLate(values, checklist);
    // 23505: a teammate created the entry first. No error: a teammate saved since `current`.
    if (error && error.code !== "23505") return { status: "error", message: "We couldn't save your entry. Try again." };
    current = await loadSavedEntry(supabase, teamId);
  }
  return { status: "error", message: "Teammates are saving at the same moment. Wait a few seconds and save again." };
}
