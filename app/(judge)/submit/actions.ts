"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkEntry } from "./_lib/checklist";
import { getSubmitContext, LIMITS, type EntryLink, type EntryValues } from "./_lib/entry";

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
  for (const key of ["video_url", "repo_url"] as const) {
    if (values[key] && !isWebUrl(values[key])) {
      return { status: "error", message: `The ${key === "video_url" ? "demo video" : "repo"} link should start with https://.` };
    }
  }

  const checklist = await checkEntry(values);
  const supabase = await createClient();

  if (ctx.isPast) {
    const { error } = await supabase
      .from("judge_late_saves")
      .insert({ team_id: ctx.team.id, payload: { ...values, checklist } });
    if (error) return { status: "error", message: "We couldn't save your changes. Find an organizer." };
    revalidatePath("/submit");
    return {
      status: "late",
      message: "Submissions closed, so this save is marked late. An organizer will accept or reject it.",
    };
  }

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
  const { error } = ctx.entry
    ? await supabase.from("judge_entries").update(row).eq("id", ctx.entry.id)
    : await supabase.from("judge_entries").insert({ ...row, team_id: ctx.team.id });
  if (error) {
    // Raced the deadline, or a teammate created the entry a moment ago.
    if (error.code === "42501") return { status: "error", message: "Submissions just closed. Reload the page." };
    if (error.code === "23505") return { status: "error", message: "A teammate just saved. Reload the page and try again." };
    return { status: "error", message: "We couldn't save your entry. Try again." };
  }

  revalidatePath("/submit");
  const missing = checklist.items.filter((item) => item.required && item.status !== "ok").length;
  return {
    status: "ok",
    message: missing ? `Saved. ${missing} required item${missing === 1 ? "" : "s"} still need fixing.` : "Saved. Everything judges need is there.",
  };
}
