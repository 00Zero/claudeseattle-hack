"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkEntry } from "@/app/(judge)/submit/_lib/checklist";
import { LIMITS } from "@/app/(judge)/submit/_lib/entry";

// Admin judging actions. Each re-checks the caller is an admin, then writes with the
// service-role client (the admin layout's check is not enough on its own).

export type RowState = { status: "idle" | "ok" | "error"; message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function id(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function done(): RowState {
  revalidatePath("/admin/judging");
  revalidatePath("/judge");
  return { status: "ok" };
}

// Judges in one world: real judges score real entries, test judges test entries
// (lib/test-accounts.ts). Admins are real.
async function judgeIds(admin: ReturnType<typeof createAdminClient>, roles: string[], isTest: boolean) {
  const { data } = await admin.from("profiles").select("id").in("platform_role", roles).eq("is_test", isTest);
  return (data ?? []).map((p) => p.id as string);
}

async function entryIsTest(admin: ReturnType<typeof createAdminClient>, entryId: string) {
  const { data } = await admin.from("judge_entry_results").select("is_test").eq("entry_id", entryId).maybeSingle();
  return Boolean(data?.is_test);
}

// Prelim: one judge per entry from the table's dropdown. An empty choice unassigns.
export async function assignJudge(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const entryId = id(formData, "entry_id");
  if (!entryId) return { status: "error", message: "Missing entry." };
  const judgeId = formData.get("judge_id") ? id(formData, "judge_id") : null;
  if (formData.get("judge_id") && !judgeId) return { status: "error", message: "Unknown judge." };

  const admin = createAdminClient();
  if (judgeId && !(await judgeIds(admin, ["judge", "admin"], await entryIsTest(admin, entryId))).includes(judgeId)) {
    return { status: "error", message: "That person isn't a judge for this entry. Set their role on the People tab." };
  }
  const { error: clearError } = await admin.from("judge_assignments").delete().eq("entry_id", entryId);
  if (clearError) return { status: "error", message: clearError.message };
  if (judgeId) {
    const { error } = await admin.from("judge_assignments").insert({ entry_id: entryId, judge_id: judgeId });
    if (error) return { status: "error", message: error.message };
  }
  return done();
}

// Spread submitted entries that have no judge across people with the judge role, filling
// whoever has the fewest first. Existing assignments are kept, so it's safe to run again.
// One world at a time (the page's "world" field): real entries to real judges, test to test.
export async function autoAssign(formData: FormData): Promise<void> {
  await assertAdmin();
  const isTest = formData.get("world") === "test";
  const admin = createAdminClient();
  const judges = await judgeIds(admin, ["judge"], isTest);
  if (!judges.length) {
    throw new Error(isTest ? "No test account has the judge role yet." : "No one has the judge role yet. Set roles on the People tab.");
  }

  const [{ data: entries }, { data: assignments }] = await Promise.all([
    admin
      .from("judge_entry_results")
      .select("entry_id")
      .eq("submitted", true)
      .eq("is_test", isTest)
      .order("last_saved_at"),
    admin.from("judge_assignments").select("entry_id, judge_id"),
  ]);
  const assigned = new Set((assignments ?? []).map((a) => a.entry_id));
  const load = new Map(judges.map((j) => [j, 0]));
  for (const a of assignments ?? []) if (load.has(a.judge_id)) load.set(a.judge_id, load.get(a.judge_id)! + 1);

  const rows: { entry_id: string; judge_id: string }[] = [];
  for (const { entry_id } of entries ?? []) {
    if (assigned.has(entry_id)) continue;
    const [judge] = [...load.entries()].sort((a, b) => a[1] - b[1])[0];
    rows.push({ entry_id, judge_id: judge });
    load.set(judge, load.get(judge)! + 1);
  }
  if (rows.length) {
    const { error } = await admin.from("judge_assignments").insert(rows);
    if (error) throw new Error(error.message);
  }
  done();
}

// Force an entry into or out of the final, or back to the prelim ranking ("auto").
export async function setFinalist(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const entryId = id(formData, "entry_id");
  const choice = formData.get("finalist");
  if (!entryId || !["auto", "yes", "no"].includes(String(choice))) return { status: "error", message: "Bad request." };
  const { error } = await createAdminClient()
    .from("judge_entries")
    .update({ finalist_override: choice === "auto" ? null : choice === "yes" })
    .eq("id", entryId);
  if (error) return { status: "error", message: error.message };
  return done();
}

const ENTRY_FIELDS = ["title", "tagline", "description_short", "description_long", "video_url", "repo_url", "links", "checklist"] as const;

// Accept: copy the late save onto the team's entry (creating it if the team never saved before
// the deadline), stamped with when and by whom it was saved. Reject: keep the on-time version.
export async function decideLateSave(formData: FormData) {
  const me = await assertAdmin();
  const lateId = id(formData, "late_id");
  const decision = formData.get("decision");
  if (!lateId || (decision !== "accepted" && decision !== "rejected")) throw new Error("Bad request.");

  const admin = createAdminClient();
  const { data: late, error: readError } = await admin
    .from("judge_late_saves")
    .select("team_id, saved_by, saved_at, payload, decision")
    .eq("id", lateId)
    .single();
  if (readError || !late) throw new Error("That late save doesn't exist.");
  if (late.decision !== "pending") throw new Error("That late save was already decided.");

  if (decision === "accepted") {
    const payload = (late.payload ?? {}) as Record<string, unknown>;
    const row: Record<string, unknown> = { team_id: late.team_id, last_saved_at: late.saved_at, last_saved_by: late.saved_by };
    for (const field of ENTRY_FIELDS) if (field in payload) row[field] = payload[field] === "" ? null : payload[field];
    if (!row.title) row.title = "";
    const { error } = await admin.from("judge_entries").upsert(row, { onConflict: "team_id" });
    if (error) throw new Error(error.message);
  }

  const { error } = await admin
    .from("judge_late_saves")
    .update({ decision, decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", lateId);
  if (error) throw new Error(error.message);
  revalidatePath("/submit");
  done();
}

// "Publish finalists" and "publish winners" on event_settings; /results shows only what's on.
export async function setPublish(formData: FormData) {
  await assertAdmin();
  const field = formData.get("field");
  if (field !== "publish_finalists" && field !== "publish_winners") throw new Error("Bad request.");
  const { error } = await createAdminClient()
    .from("event_settings")
    .update({ [field]: formData.get("value") === "true" })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/results");
  done();
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function fieldText(formData: FormData, key: string, max: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// Fallback (docs/REQUIREMENTS.md, "Working agreement"): an entry for a team that isn't on the
// Teams app, with a free-text team name and member emails. Real world only (no team, so not
// test). Members can't edit it; an admin enters it for them. Emails stay admin-only.
export async function createFallbackEntry(_prev: RowState, formData: FormData): Promise<RowState> {
  const me = await assertAdmin();
  const teamName = fieldText(formData, "team_name", 60);
  const emails = [...new Set(fieldText(formData, "member_emails", 1000).toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  const values = {
    title: fieldText(formData, "title", LIMITS.title),
    tagline: fieldText(formData, "tagline", LIMITS.tagline),
    description_short: fieldText(formData, "description_short", LIMITS.description_short),
    description_long: fieldText(formData, "description_long", LIMITS.description_long),
    video_url: fieldText(formData, "video_url", LIMITS.url),
    repo_url: fieldText(formData, "repo_url", LIMITS.url),
    links: [],
  };

  if (teamName.length < 2) return { status: "error", message: "Add the team's name." };
  if (!emails.length || emails.length > 6) return { status: "error", message: "Add 1 to 6 member emails." };
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { status: "error", message: `“${bad}” isn't an email address.` };
  if (!values.title) return { status: "error", message: "Add the project title." };
  if (!isWebUrl(values.video_url) || !isWebUrl(values.repo_url)) {
    return { status: "error", message: "The demo video and repo links are required and start with https://." };
  }

  const checklist = await checkEntry(values);
  const { error } = await createAdminClient()
    .from("judge_entries")
    .insert({
      fallback_team_name: teamName,
      fallback_member_emails: emails,
      title: values.title,
      tagline: values.tagline || null,
      description_short: values.description_short || null,
      description_long: values.description_long || null,
      video_url: values.video_url,
      repo_url: values.repo_url,
      checklist,
      last_saved_at: new Date().toISOString(),
      last_saved_by: me.id,
    });
  if (error) return { status: "error", message: error.message };
  return { ...done(), message: `Added ${teamName}.` };
}
