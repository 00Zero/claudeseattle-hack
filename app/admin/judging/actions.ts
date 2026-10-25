"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkEntry } from "@/app/(judge)/submit/_lib/checklist";
import { LIMITS } from "@/app/(judge)/submit/_lib/entry";
import { aiNotesConfigured, generateAiNotes, MODEL as NOTES_MODEL, type RosterForNotes } from "@/app/(judge)/_lib/ai-notes";
import { criteriaLocked, getEnabledCriteria } from "@/app/(judge)/_lib/criteria";
import { ALL_CRITERIA, criteriaKeys, sameCriteria } from "@/app/(judge)/_lib/scoring";

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

type Admin = ReturnType<typeof createAdminClient>;

// Judges in one world: real judges score real entries, test judges test entries
// (lib/test-accounts.ts). Admins are real.
async function judgeIds(admin: Admin, roles: string[], isTest: boolean) {
  const { data } = await admin.from("profiles").select("id").in("platform_role", roles).eq("is_test", isTest);
  return (data ?? []).map((p) => p.id as string);
}

async function entryIsTest(admin: Admin, entryId: string) {
  const { data } = await admin.from("judge_entry_results").select("is_test").eq("entry_id", entryId).maybeSingle();
  return Boolean(data?.is_test);
}

// Judging groups (judge_groups migration): judges in a group score the same entries, and the
// group sends its top entry by mean score to the final. A judge in no group judges alone.
// judge_assignments holds one row per member per entry, so RLS and /judge need nothing else.

async function groupMembers(admin: Admin, groupId: string) {
  const { data, error } = await admin.from("judge_group_members").select("judge_id").eq("group_id", groupId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => m.judge_id as string);
}

async function loadGroup(admin: Admin, groupId: string) {
  const { data } = await admin.from("judge_groups").select("id, name, is_test").eq("id", groupId).maybeSingle();
  return data as { id: string; name: string; is_test: boolean } | null;
}

// Every member gets a row for every entry any member has, so the group judges one set together.
async function syncGroup(admin: Admin, groupId: string) {
  const members = await groupMembers(admin, groupId);
  if (!members.length) return 0;
  const { data, error } = await admin.from("judge_assignments").select("entry_id").in("judge_id", members);
  if (error) throw new Error(error.message);
  const entries = [...new Set((data ?? []).map((a) => a.entry_id as string))];
  if (entries.length) {
    const { error: upsertError } = await admin
      .from("judge_assignments")
      .upsert(entries.flatMap((entry_id) => members.map((judge_id) => ({ entry_id, judge_id }))), { onConflict: "entry_id,judge_id", ignoreDuplicates: true });
    if (upsertError) throw new Error(upsertError.message);
  }
  return entries.length;
}

// A judge who may join a group in this world and isn't in one yet; null when that's fine.
async function cannotJoin(admin: Admin, judgeId: string, isTest: boolean) {
  if (!(await judgeIds(admin, ["judge", "admin"], isTest)).includes(judgeId)) return "Only judges (and admins) can be in a group. Set roles on the People tab.";
  const { data } = await admin.from("judge_group_members").select("judge_groups(name)").eq("judge_id", judgeId).maybeSingle();
  if (data) return `That judge is already in ${(data.judge_groups as unknown as { name: string } | null)?.name ?? "a group"}. Remove them there first.`;
  return null;
}

function entries(n: number) {
  return `${n} entr${n === 1 ? "y" : "ies"}`;
}

// New group: a name and two or more judges who aren't in a group. Entries they already have
// become the group's, so every member scores all of them.
export async function createGroup(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const isTest = formData.get("world") === "test";
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const picked = [...new Set(formData.getAll("judge_id").map(String))];
  if (!name) return { status: "error", message: "Name the group." };
  if (picked.length < 2 || picked.some((j) => !UUID.test(j))) return { status: "error", message: "Pick two or more judges." };

  const admin = createAdminClient();
  for (const judgeId of picked) {
    const reason = await cannotJoin(admin, judgeId, isTest);
    if (reason) return { status: "error", message: reason };
  }
  const { data: group, error } = await admin.from("judge_groups").insert({ name, is_test: isTest }).select("id").single();
  if (error || !group) return { status: "error", message: error?.message ?? "Couldn't create the group." };
  const { error: membersError } = await admin.from("judge_group_members").insert(picked.map((judge_id) => ({ judge_id, group_id: group.id })));
  if (membersError) {
    await admin.from("judge_groups").delete().eq("id", group.id);
    return { status: "error", message: membersError.message };
  }
  const count = await syncGroup(admin, group.id);
  done();
  return { status: "ok", message: `Created ${name}${count ? ` with ${entries(count)} from its judges` : ""}.` };
}

// Add a judge to a group: they get the group's entries, and any entries they had alone become
// the group's too.
export async function addGroupMember(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const groupId = id(formData, "group_id");
  const judgeId = id(formData, "judge_id");
  if (!groupId || !judgeId) return { status: "error", message: "Pick a judge." };
  const admin = createAdminClient();
  const group = await loadGroup(admin, groupId);
  if (!group) return { status: "error", message: "That group doesn't exist." };
  const reason = await cannotJoin(admin, judgeId, group.is_test);
  if (reason) return { status: "error", message: reason };
  const { error } = await admin.from("judge_group_members").insert({ judge_id: judgeId, group_id: groupId });
  if (error) return { status: "error", message: error.message };
  await syncGroup(admin, groupId);
  return done();
}

// Remove a judge from a group: the group keeps its entries and the judge loses them (their saved
// scores stay but no longer count toward the group). If they were the last member, the group is
// deleted and they keep the entries, judging alone.
export async function removeGroupMember(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const groupId = id(formData, "group_id");
  const judgeId = id(formData, "judge_id");
  if (!groupId || !judgeId) return { status: "error", message: "Bad request." };
  const admin = createAdminClient();
  const others = (await groupMembers(admin, groupId)).filter((j) => j !== judgeId);
  if (others.length) {
    const { error } = await admin.from("judge_assignments").delete().eq("judge_id", judgeId);
    if (error) return { status: "error", message: error.message };
  }
  const { error } = others.length
    ? await admin.from("judge_group_members").delete().eq("judge_id", judgeId).eq("group_id", groupId)
    : await admin.from("judge_groups").delete().eq("id", groupId);
  if (error) return { status: "error", message: error.message };
  return done();
}

// Delete a group: its judges go back to judging alone, and its entries go back to having no
// judge (otherwise each former member would have every entry and send their own finalist).
// Saved scores stay.
export async function deleteGroup(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const groupId = id(formData, "group_id");
  if (!groupId) return { status: "error", message: "Bad request." };
  const admin = createAdminClient();
  const members = await groupMembers(admin, groupId);
  if (members.length) {
    const { error } = await admin.from("judge_assignments").delete().in("judge_id", members);
    if (error) return { status: "error", message: error.message };
  }
  const { error } = await admin.from("judge_groups").delete().eq("id", groupId);
  if (error) return { status: "error", message: error.message };
  return done();
}

// Prelim: a group or a judge (in no group) per entry from the table's dropdown, as
// "group:<id>" or "judge:<id>". An empty choice unassigns.
export async function assignJudge(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const entryId = id(formData, "entry_id");
  if (!entryId) return { status: "error", message: "Missing entry." };
  const choice = String(formData.get("unit") ?? "");
  const [kind, unitId] = choice.split(":");
  if (choice && (!["group", "judge"].includes(kind) || !UUID.test(unitId ?? ""))) return { status: "error", message: "Unknown judge or group." };

  const admin = createAdminClient();
  const isTest = await entryIsTest(admin, entryId);
  let judges: string[] = [];
  if (kind === "group") {
    const group = await loadGroup(admin, unitId);
    if (!group || group.is_test !== isTest) return { status: "error", message: "That group doesn't judge this world's entries." };
    judges = await groupMembers(admin, unitId);
    if (!judges.length) return { status: "error", message: "That group has no judges yet." };
  } else if (kind === "judge") {
    if (!(await judgeIds(admin, ["judge", "admin"], isTest)).includes(unitId)) {
      return { status: "error", message: "That person isn't a judge for this entry. Set their role on the People tab." };
    }
    const { data: grouped } = await admin.from("judge_group_members").select("group_id").eq("judge_id", unitId).maybeSingle();
    judges = grouped ? await groupMembers(admin, grouped.group_id) : [unitId];
  }
  const { error: clearError } = await admin.from("judge_assignments").delete().eq("entry_id", entryId);
  if (clearError) return { status: "error", message: clearError.message };
  if (judges.length) {
    const { error } = await admin.from("judge_assignments").insert(judges.map((judge_id) => ({ entry_id: entryId, judge_id })));
    if (error) return { status: "error", message: error.message };
  }
  return done();
}

// Spread submitted entries that have no judge across groups and the judges in no group (people
// with the judge role), filling whoever has the fewest entries first. Existing assignments are
// kept, so it's safe to run again. One world at a time (the page's "world" field): real entries to
// real judges, test to test. Returns a message for the button instead of throwing, so "no judges
// yet" isn't an error page.
export async function autoAssign(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const isTest = formData.get("world") === "test";
  const admin = createAdminClient();
  const [judges, { data: groups }, { data: memberships }] = await Promise.all([
    judgeIds(admin, ["judge"], isTest),
    admin.from("judge_groups").select("id").eq("is_test", isTest),
    admin.from("judge_group_members").select("judge_id, group_id"),
  ]);
  // A unit is a group (its members) or a judge in no group (themselves).
  const unitOf = new Map((memberships ?? []).map((m) => [m.judge_id as string, m.group_id as string]));
  const units = new Map<string, string[]>();
  for (const g of groups ?? []) units.set(g.id, []);
  for (const m of memberships ?? []) units.get(m.group_id)?.push(m.judge_id);
  for (const [unit, members] of units) if (!members.length) units.delete(unit);
  for (const j of judges) if (!unitOf.has(j)) units.set(j, [j]);
  if (!units.size) {
    return {
      status: "error",
      message: isTest
        ? "No test account has the judge role yet. Set one on Test accounts."
        : "No real account has the judge role yet. Set roles on the People tab, or switch to Test entries.",
    };
  }

  const [{ data: results }, { data: assignments }] = await Promise.all([
    admin
      .from("judge_entry_results")
      .select("entry_id")
      .eq("submitted", true)
      .eq("is_test", isTest)
      .order("last_saved_at"),
    admin.from("judge_assignments").select("entry_id, judge_id"),
  ]);
  const assigned = new Set((assignments ?? []).map((a) => a.entry_id));
  const unitEntries = new Map([...units.keys()].map((u) => [u, new Set<string>()]));
  for (const a of assignments ?? []) unitEntries.get(unitOf.get(a.judge_id) ?? a.judge_id)?.add(a.entry_id);
  const load = new Map([...unitEntries].map(([u, set]) => [u, set.size]));

  const rows: { entry_id: string; judge_id: string }[] = [];
  let count = 0;
  for (const { entry_id } of results ?? []) {
    if (assigned.has(entry_id)) continue;
    const [unit] = [...load.entries()].sort((a, b) => a[1] - b[1])[0];
    for (const judge_id of units.get(unit)!) rows.push({ entry_id, judge_id });
    load.set(unit, load.get(unit)! + 1);
    count++;
  }
  if (rows.length) {
    const { error } = await admin.from("judge_assignments").insert(rows);
    if (error) return { status: "error", message: error.message };
  }
  done();
  return {
    status: "ok",
    message: count ? `Assigned ${entries(count)}.` : "Every submitted entry already has a judge.",
  };
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

const ENTRY_FIELDS = ["title", "tagline", "description_short", "description_long", "video_url", "repo_url", "links", "contributions", "checklist"] as const;

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

// The criteria judges score (event_settings.judging_criteria): one checkbox per criterion, at
// least one on. Locked once any real-world score exists, so every score in a round uses the same
// criteria; test-world scores don't lock it. The default set is stored as null.
export async function setJudgingCriteria(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  const picked = formData.getAll("criteria").map(String);
  if (!picked.length) return { status: "error", message: "Keep at least one criterion on." };
  if (picked.some((k) => !ALL_CRITERIA.some((c) => c.key === k))) return { status: "error", message: "Unknown criterion." };
  const keys = criteriaKeys(picked);

  const admin = createAdminClient();
  const lock = await criteriaLocked(admin);
  if (lock.locked) {
    return {
      status: "error",
      message: lock.failed ? "Couldn't check for scores, so the criteria stay as they are." : "Judges have already scored real entries, so the criteria are locked.",
    };
  }
  const { error } = await admin
    .from("event_settings")
    .update({ judging_criteria: sameCriteria(keys, null) ? null : keys })
    .eq("id", 1);
  if (error) return { status: "error", message: error.message };
  revalidatePath("/");
  revalidatePath("/submit");
  revalidatePath("/judge", "layout");
  done();
  return { status: "ok", message: "Saved." };
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
    description: fieldText(formData, "description", LIMITS.description),
    video_url: fieldText(formData, "video_url", LIMITS.url),
    repo_url: fieldText(formData, "repo_url", LIMITS.url),
    links: [],
    contributions: "",
  };

  if (teamName.length < 2) return { status: "error", message: "Add the team's name." };
  if (!emails.length || emails.length > 6) return { status: "error", message: "Add 1 to 6 member emails." };
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { status: "error", message: `“${bad}” isn't an email address.` };
  if (!values.title) return { status: "error", message: "Add the project title." };
  if (!isWebUrl(values.video_url) || !isWebUrl(values.repo_url)) {
    return { status: "error", message: "The demo video and repo links are required and start with https://." };
  }

  // No two entries may share a team name (ignoring case and spacing): judges, the admin table,
  // and the public results would show two indistinguishable teams.
  const admin = createAdminClient();
  const [{ data: teams }, { data: fallbacks }] = await Promise.all([
    admin.from("teams").select("name"),
    admin.from("judge_entries").select("fallback_team_name").not("fallback_team_name", "is", null),
  ]);
  const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
  const taken = [...(teams ?? []).map((t) => t.name as string), ...(fallbacks ?? []).map((f) => f.fallback_team_name as string)];
  const clash = taken.find((name) => key(name) === key(teamName));
  if (clash) return { status: "error", message: `A team called “${clash}” already exists. Use a different name.` };

  const checklist = await checkEntry(values);
  const { error } = await admin
    .from("judge_entries")
    .insert({
      fallback_team_name: teamName,
      fallback_member_emails: emails,
      title: values.title,
      tagline: values.tagline || null,
      description_long: values.description || null,
      video_url: values.video_url,
      repo_url: values.repo_url,
      checklist,
      last_saved_at: new Date().toISOString(),
      last_saved_by: me.id,
    });
  if (error) return { status: "error", message: error.message };
  return { ...done(), message: `Added ${teamName}.` };
}

const NOTES_BATCH = 10;
const NOTES_PARALLEL = 4;

// AI notes for judges (app/(judge)/_lib/ai-notes.ts). One world at a time; writes notes, plus the
// admin-only tie-break rating (judge_ai_ratings), for submitted entries missing either one or
// whose entry changed after they were written.
// A batch per click keeps each request well under the function time limit.
export async function generateNotes(_prev: RowState, formData: FormData): Promise<RowState> {
  await assertAdmin();
  if (!aiNotesConfigured()) return { status: "error", message: "AI_GATEWAY_API_KEY isn't set, so AI notes are off." };
  const isTest = formData.get("world") === "test";
  const admin = createAdminClient();

  const [{ data: results }, { data: entries }, { data: notes }, { data: ratings }, { criteria, keys }] = await Promise.all([
    admin.from("judge_entry_results").select("entry_id").eq("submitted", true).eq("is_test", isTest),
    admin
      .from("judge_entries")
      .select("id, team_id, title, tagline, description_short, description_long, video_url, repo_url, links, contributions, updated_at"),
    admin.from("judge_ai_notes").select("entry_id, created_at"),
    admin.from("judge_ai_ratings").select("entry_id, created_at, criteria"),
    getEnabledCriteria(admin),
  ]);
  const inWorld = new Set((results ?? []).map((r) => r.entry_id as string));
  const notedAt = new Map((notes ?? []).map((n) => [n.entry_id as string, n.created_at as string]));
  // Ratings for other criteria than the enabled ones are stale too (the notes are written with them).
  const ratedAt = new Map(
    (ratings ?? []).filter((r) => sameCriteria(r.criteria as string[] | null, keys)).map((r) => [r.entry_id as string, r.created_at as string]),
  );
  const fresh = (at: string | undefined, updated: string) => Boolean(at && at >= updated);
  const todo = (entries ?? []).filter(
    (e) => inWorld.has(e.id) && !(fresh(notedAt.get(e.id), e.updated_at) && fresh(ratedAt.get(e.id), e.updated_at)),
  );
  if (!todo.length) return { status: "ok", message: "Every submitted entry has up-to-date notes." };

  const batch = todo.slice(0, NOTES_BATCH);
  // Rosters, for Teamwork: names and titles as judges see them on the entry page.
  const rosters = new Map<string, RosterForNotes>();
  if (keys.includes("teamwork")) {
    const teamIds = batch.map((e) => e.team_id).filter((t): t is string => Boolean(t));
    const [{ data: members }, { data: parts }] = teamIds.length
      ? await Promise.all([
          admin.from("team_members").select("team_id, profiles(id, display_name, job_title, company)").eq("status", "member").in("team_id", teamIds),
          admin.from("judge_contributions").select("team_id, profile_id, body").in("team_id", teamIds),
        ])
      : [{ data: [] }, { data: [] }];
    const partBy = new Map((parts ?? []).map((c) => [`${c.team_id}:${c.profile_id}`, c.body as string]));
    for (const m of members ?? []) {
      const p = m.profiles as unknown as { id: string; display_name: string; job_title: string | null; company: string | null } | null;
      if (!p) continue;
      const list = rosters.get(m.team_id) ?? [];
      list.push({
        name: p.display_name,
        detail: [p.job_title, p.company].filter(Boolean).join(" at ") || null,
        contribution: partBy.get(`${m.team_id}:${p.id}`) ?? null,
      });
      rosters.set(m.team_id, list);
    }
  }
  let written = 0;
  let failed = 0;
  for (let i = 0; i < batch.length; i += NOTES_PARALLEL) {
    await Promise.all(
      batch.slice(i, i + NOTES_PARALLEL).map(async (entry) => {
        try {
          const result = await generateAiNotes(entry, criteria, rosters.get(entry.team_id ?? "") ?? []);
          if (!result) {
            failed++;
            return;
          }
          const now = new Date().toISOString();
          // Notes for judges carry no scores; the rating goes only to the admin-only table.
          const [{ error: notesError }, { error: ratingError }] = await Promise.all([
            admin.from("judge_ai_notes").upsert({ entry_id: entry.id, model: NOTES_MODEL, notes: result.notes, draft_scores: null, created_at: now }),
            admin
              .from("judge_ai_ratings")
              .upsert({
                entry_id: entry.id,
                model: NOTES_MODEL,
                criteria: result.rating.criteria,
                scores: result.rating.scores,
                rating: result.rating.mean,
                created_at: now,
              }),
          ]);
          if (notesError || ratingError) failed++;
          else written++;
        } catch (error) {
          console.error("Judge AI notes failed:", error instanceof Error ? error.message : error);
          failed++;
        }
      }),
    );
  }

  revalidatePath("/admin/judging");
  revalidatePath("/judge");
  const left = todo.length - written;
  return {
    status: failed && !written ? "error" : "ok",
    message: `Wrote notes for ${written} entr${written === 1 ? "y" : "ies"}${failed ? `, ${failed} failed` : ""}.${left ? ` ${left} still need notes; click again.` : ""}`,
  };
}
