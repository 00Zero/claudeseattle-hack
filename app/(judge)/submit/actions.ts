"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatPacific } from "@/lib/time";
import { checkEntry } from "./_lib/checklist";
import { getSubmissionDeadline, getSubmitContext, LIMITS, type EntryLink, type EntryValues } from "./_lib/entry";

export type SaveState = { status: "idle" | "ok" | "late" | "error"; message?: string };

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

// Save the caller's team entry. Before the deadline it writes judge_entries (RLS: a team member
// who may submit, and judge_submissions_open()); a trigger stamps who saved and when. After the
// deadline the save is kept in judge_late_saves for an organizer to accept or reject.
export async function saveEntry(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getSubmitContext();
  if (ctx.kind === "signed_out") return { status: "error", message: "Your session expired. Log in again." };
  if (ctx.kind === "no_access") return { status: "error", message: "Your registration is awaiting approval." };
  if (ctx.kind === "blocked") return { status: "error", message: ctx.reason };

  const links = parseLinks(formData);
  if (typeof links === "string") return { status: "error", message: links };

  const values: EntryValues = {
    title: text(formData, "title", LIMITS.title),
    tagline: text(formData, "tagline", LIMITS.tagline),
    description_short: text(formData, "description_short", LIMITS.description_short),
    description_long: text(formData, "description_long", LIMITS.description_long),
    video_url: text(formData, "video_url", LIMITS.url),
    repo_url: text(formData, "repo_url", LIMITS.url),
    links,
  };
  if (!values.title) return { status: "error", message: "Give your project a title." };
  // docs/REQUIREMENTS.md: demo video and repo are required. Whether they load is the checklist's job.
  if (!values.video_url) return { status: "error", message: "Add a link to your demo video. You can update it any time before the deadline." };
  if (!values.repo_url) return { status: "error", message: "Add your GitHub repo link. You can update it any time before the deadline." };
  for (const key of ["video_url", "repo_url"] as const) {
    if (!isWebUrl(values[key])) {
      return { status: "error", message: `The ${key === "video_url" ? "demo video" : "repo"} link should start with https://.` };
    }
  }

  const checklist = await checkEntry(values);
  const supabase = await createClient();

  // After the deadline, keep the save for an organizer instead of losing it.
  const teamId = ctx.team.id;
  async function saveLate(): Promise<SaveState> {
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

  if (ctx.isPast) return saveLate();

  const row = {
    title: values.title,
    tagline: values.tagline || null,
    description_short: values.description_short || null,
    description_long: values.description_long || null,
    video_url: values.video_url || null,
    repo_url: values.repo_url || null,
    links: values.links,
    checklist,
  };
  // The entry's last_saved_at when this form loaded ("" if it hadn't been saved yet). The update
  // only matches if nobody saved since, so a teammate's stale form can't quietly undo a save.
  const loadedSavedAt = text(formData, "last_saved_at", 64);
  const { data: saved, error } = ctx.entry
    ? await supabase
        .from("judge_entries")
        .update(row)
        .eq("id", ctx.entry.id)
        .filter("last_saved_at", loadedSavedAt ? "eq" : "is", loadedSavedAt || null)
        .select("id")
    : await supabase.from("judge_entries").insert({ ...row, team_id: ctx.team.id }).select("id");
  if (error || !saved?.length) {
    // The deadline passed while this save was running (the link checks take a few seconds), so
    // RLS refused it: store it as a late save rather than dropping it.
    if ((await getSubmissionDeadline()).isPast) return saveLate();
    const { data: latest } = await supabase
      .from("judge_entries")
      .select("last_saved_at, saver:profiles!judge_entries_last_saved_by_fkey(display_name)")
      .eq("team_id", teamId)
      .maybeSingle();
    if (latest?.last_saved_at && latest.last_saved_at !== loadedSavedAt) {
      const name = (latest.saver as unknown as { display_name: string } | null)?.display_name ?? "A teammate";
      return {
        status: "error",
        message: `${name} saved changes at ${formatPacific(latest.last_saved_at)} after you opened this page, so your save didn't go through. Your edits are still here: copy anything you need, reload to see their version, then save again.`,
      };
    }
    if (error?.code === "23505") return { status: "error", message: "A teammate just saved. Reload the page and try again." };
    return { status: "error", message: "We couldn't save your entry. Try again." };
  }

  revalidatePath("/submit");
  const missing = checklist.items.filter((item) => item.required && item.status !== "ok").length;
  return {
    status: "ok",
    message: missing ? `Saved. ${missing} required item${missing === 1 ? " still needs" : "s still need"} fixing.` : "Saved. Everything judges need is there.",
  };
}
