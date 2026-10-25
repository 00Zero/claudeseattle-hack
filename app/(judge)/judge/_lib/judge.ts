import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { AiNotesBody } from "../../_lib/ai-notes";
import { getEnabledCriteria } from "../../_lib/criteria";
import { ALL_CRITERIA, mean, rankByScore, type Criterion } from "../../_lib/scoring";
import { normalizeGithubUsername } from "@/app/(teams)/teams/_lib/links";

// Data for /judge. Everything reads as the logged-in judge, so RLS limits it to their own
// assignments and scores; the finalist list comes from judge_finalists(), which checks is_judge().

export type Round = "prelim" | "final";

export type JudgeViewer =
  | { kind: "signed_out" }
  | { kind: "not_judge" }
  | { kind: "judge"; id: string; name: string; isAdmin: boolean };

export async function getJudgeViewer(): Promise<JudgeViewer> {
  const profile = await getCurrentProfile();
  if (!profile) return { kind: "signed_out" };
  if (profile.platform_role !== "judge" && profile.platform_role !== "admin") return { kind: "not_judge" };
  return { kind: "judge", id: profile.id, name: profile.display_name, isAdmin: profile.platform_role === "admin" };
}

// criteria: the keys `scores` covers, in order (null = the default four).
export type MyScore = { scores: number[]; criteria: string[] | null; comment: string | null; updated_at: string };

type EntryRow = { id: string; title: string; fallback_team_name: string | null; teams: { name: string } | null };

function teamName(entry: EntryRow) {
  return entry.teams?.name ?? entry.fallback_team_name ?? "Team";
}

async function myScores(judgeId: string, round: Round) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("judge_scores")
    .select("entry_id, scores, criteria, comment, updated_at")
    .eq("judge_id", judgeId)
    .eq("round", round);
  return new Map((data ?? []).map((s) => [s.entry_id as string, { scores: s.scores, criteria: s.criteria, comment: s.comment, updated_at: s.updated_at } as MyScore]));
}

// The judging group an admin put me in (judge_groups), with the other judges' names; null when
// I judge alone. Also null before the judge_groups migration is applied.
async function myJudgingGroup(judgeId: string) {
  const supabase = await createClient();
  const { data: mine } = await supabase.from("judge_group_members").select("group_id, judge_groups(name)").eq("judge_id", judgeId).maybeSingle();
  if (!mine) return null;
  const { data: others } = await supabase
    .from("judge_group_members")
    .select("profiles(display_name)")
    .eq("group_id", mine.group_id)
    .neq("judge_id", judgeId);
  return {
    name: (mine.judge_groups as unknown as { name: string } | null)?.name ?? "Your group",
    others: (others ?? []).map((o) => (o.profiles as unknown as { display_name: string } | null)?.display_name ?? "another judge"),
  };
}

// My prelim entries, ranked by my mean score. Judging alone, the top entry (if not tied) is my
// finalist. In a group, the group's top entry by mean across its judges is, which I can't
// compute from my scores alone: finalistId is null and /judge marks the group's finalist from
// judge_finalists().
export async function getMyGroup(judgeId: string) {
  const supabase = await createClient();
  const [{ data, error }, group] = await Promise.all([
    supabase.from("judge_assignments").select("entry_id, judge_entries(id, title, fallback_team_name, teams(name))").eq("judge_id", judgeId),
    myJudgingGroup(judgeId),
  ]);
  if (error) return { ok: false as const };
  const scores = await myScores(judgeId, "prelim");
  const entries = (data ?? [])
    .map((a) => a.judge_entries as unknown as EntryRow | null)
    .filter((e): e is EntryRow => Boolean(e))
    .map((e) => ({ id: e.id, title: e.title, team: teamName(e), myScore: scores.get(e.id) ?? null }));
  const ranked = rankByScore(entries, (e) => (e.myScore ? mean(e.myScore.scores) : null));
  const top = ranked[0];
  const finalistId = !group && top && top.rank === 1 && !top.tied && top.score !== null ? top.id : null;
  return { ok: true as const, ranked, finalistId, group, scoredCount: entries.filter((e) => e.myScore).length };
}

export async function getFinalRound(judgeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("judge_finalists");
  if (error) return { ok: false as const };
  const scores = await myScores(judgeId, "final");
  const finalists = ((data ?? []) as { entry_id: string; team_name: string; title: string }[]).map((f) => ({
    id: f.entry_id,
    team: f.team_name,
    title: f.title,
    myScore: scores.get(f.entry_id) ?? null,
  }));
  return { ok: true as const, finalists, allScored: finalists.length > 0 && finalists.every((f) => f.myScore) };
}

// One entry for the scoring page, plus whether this judge may score it in the given round.
export async function getEntryForJudge(judgeId: string, entryId: string, round: Round) {
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("judge_entries")
    .select("id, team_id, title, tagline, description_short, description_long, video_url, repo_url, links, contributions, fallback_team_name, teams(name)")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry) return null;

  const [assigned, finalists, scores, roster, parts, notes, { criteria }] = await Promise.all([
    supabase.from("judge_assignments").select("entry_id").eq("entry_id", entryId).eq("judge_id", judgeId).maybeSingle(),
    supabase.rpc("judge_finalists"),
    myScores(judgeId, round),
    entry.team_id
      ? supabase
          .from("team_members")
          .select("profiles(id, display_name, job_title, company, github_username)")
          .eq("team_id", entry.team_id)
          .eq("status", "member")
      : Promise.resolve({ data: [] }),
    entry.team_id
      ? supabase.from("judge_contributions").select("profile_id, body, github_username").eq("team_id", entry.team_id)
      : Promise.resolve({ data: [] }),
    supabase.from("judge_ai_notes").select("notes, model").eq("entry_id", entryId).maybeSingle(),
    getEnabledCriteria(supabase),
  ]);

  const isFinalist = ((finalists.data ?? []) as { entry_id: string }[]).some((f) => f.entry_id === entryId);
  const canScore = round === "prelim" ? Boolean(assigned.data) : isFinalist;
  // github_username there: added by a teammate for someone whose profile has none.
  const partBy = new Map(((parts.data ?? []) as { profile_id: string; body: string; github_username: string | null }[]).map((p) => [p.profile_id, p]));
  type Member = { id: string; display_name: string; job_title: string | null; company: string | null; github_username: string | null };
  const members = ((roster.data ?? []) as unknown as { profiles: Member | null }[])
    .map((m) => m.profiles)
    .filter((p): p is Member => Boolean(p))
    .map((p) => ({
      name: p.display_name,
      detail: [p.job_title, p.company].filter(Boolean).join(" at ") || null,
      github: normalizeGithubUsername(p.github_username) ?? partBy.get(p.id)?.github_username ?? null,
      contribution: partBy.get(p.id)?.body ?? null,
    }));

  return {
    entry: { ...entry, links: Array.isArray(entry.links) ? entry.links : [], team: teamName(entry as unknown as EntryRow) },
    roster: members,
    canScore,
    isAssigned: Boolean(assigned.data),
    isFinalist,
    myScore: scores.get(entryId) ?? null,
    criteria,
    // Never draft_scores: judges don't see AI-suggested scores (decided Oct 24).
    notes: notes.data ? { ...normalizeNotes(notes.data.notes, criteria), model: notes.data.model as string } : null,
  };
}

// judge_ai_notes.notes is { focus, criteria, unknowns }; tolerate older shapes too. Only notes for
// enabled criteria are shown; older notes have no key, so match those by name.
function normalizeNotes(raw: unknown, enabled: Criterion[]): AiNotesBody {
  const body = (Array.isArray(raw) ? { criteria: raw } : (raw ?? {})) as Partial<AiNotesBody>;
  const list = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
  const on = new Set<string>(enabled.map((c) => c.key));
  const keyOf = (n: AiNotesBody["criteria"][number]) => n.key ?? ALL_CRITERIA.find((c) => c.name === n.criterion)?.key;
  const criteria = list(body.criteria).filter((n) => on.has(keyOf(n) ?? ""));
  return { focus: list(body.focus), criteria, unknowns: list(body.unknowns) };
}
