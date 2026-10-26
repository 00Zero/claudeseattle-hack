import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";
import { criteriaLocked, getEnabledCriteria } from "@/app/(judge)/_lib/criteria";
import { ALL_CRITERIA, DEFAULT_CRITERIA, formatScore, mean, rankByScore, sameCriteria, scoresByKey, shortName } from "@/app/(judge)/_lib/scoring";
import { FinalStandings, type FinalRow } from "./final-standings";
import { SubmitButton } from "../submit-button";
import { decideLateSave, setPublish } from "./actions";
import { aiNotesConfigured, type AiNotesBody } from "@/app/(judge)/_lib/ai-notes";
import {
  AddMemberForm,
  AiNotesForm,
  AutoAssignForm,
  CreateGroupForm,
  CriteriaForm,
  DeleteGroupButton,
  FallbackEntryForm,
  FinalistForm,
  JudgeForm,
  RemoveMemberButton,
  type JudgeOption,
  type UnitOption,
} from "./row-forms";

// Admin judging: judging groups; one row per entry with its judge or group, scores, finalist, and place; late saves to
// accept or reject; publish toggles. docs/REQUIREMENTS.md, "Judging app (Dev B)", admin table.
// Reads judge_entry_results with the service role, after the admin check.

// "Write AI notes" runs a batch of model calls in one server action.
export const maxDuration = 300;

type Result = {
  entry_id: string;
  team_id: string | null;
  team_name: string;
  title: string;
  last_saved_at: string | null;
  submitted: boolean;
  late: boolean;
  late_pending: boolean;
  prelim_score: string | null;
  prelim_votes: number;
  final_score: string | null;
  final_votes: number;
  is_finalist: boolean;
  place: number | null;
  is_test: boolean;
};

const SORTS = {
  team: (a: Result, b: Result) => a.team_name.localeCompare(b.team_name),
  submitted: (a: Result, b: Result) => (b.last_saved_at ?? "").localeCompare(a.last_saved_at ?? ""),
  judge: () => 0, // replaced below, needs the assignment map
  prelim: (a: Result, b: Result) => Number(b.prelim_score ?? -1) - Number(a.prelim_score ?? -1),
  final: (a: Result, b: Result) => Number(b.final_score ?? -1) - Number(a.final_score ?? -1),
  place: (a: Result, b: Result) => (a.place ?? 99) - (b.place ?? 99),
};
type SortKey = keyof typeof SORTS;

const th = "px-2 py-2 font-medium";
const td = "px-2 py-2 align-top";
const small = "rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5";

export default async function JudgingAdminPage({ searchParams }: PageProps<"/admin/judging">) {
  await requireAdminPage();
  const { sort: sortParam, world, ai } = await searchParams;
  const sort: SortKey = typeof sortParam === "string" && sortParam in SORTS ? (sortParam as SortKey) : "team";
  // Test accounts' teams, entries and judges (lib/test-accounts.ts) are a separate world:
  // ?world=test shows them instead of the real ones. Nothing mixes across.
  const isTest = world === "test";
  const worldParam = isTest ? "&world=test" : "";
  // Admin-only AI tie-break rating (judge_ai_ratings): hidden unless asked for with ?ai=1.
  const showAi = ai === "1";
  const aiParam = showAi ? "&ai=1" : "";

  const admin = createAdminClient();
  const [results, entries, assignments, allScores, judges, groups, memberships, teams, lateSaves, settings, aiNotes, enabled, lock] = await Promise.all([
    admin.from("judge_entry_results").select("*"),
    admin.from("judge_entries").select("id, finalist_override"),
    admin.from("judge_assignments").select("entry_id, judge_id"),
    admin.from("judge_scores").select("entry_id, judge_id, round, scores, criteria"),
    admin
      .from("profiles")
      .select("id, display_name, platform_role")
      .in("platform_role", ["judge", "admin"])
      .eq("is_test", isTest)
      .order("display_name"),
    // Missing until the judge_groups migration is applied: then everyone judges alone.
    admin.from("judge_groups").select("id, name").eq("is_test", isTest).order("name"),
    admin.from("judge_group_members").select("judge_id, group_id").order("added_at"),
    admin.from("teams").select("id, leader:profiles!teams_leader_id_fkey!inner(is_test)", { count: "exact", head: true }).eq("leader.is_test", isTest),
    admin
      .from("judge_late_saves")
      .select("id, saved_at, payload, teams(name), saver:profiles!judge_late_saves_saved_by_fkey(display_name, is_test)")
      .eq("decision", "pending")
      .order("saved_at"),
    admin.from("event_settings").select("submissions_close_at, publish_finalists, publish_winners").eq("id", 1).single(),
    admin.from("judge_ai_notes").select("entry_id, notes"),
    getEnabledCriteria(admin),
    criteriaLocked(admin),
  ]);
  const ratings = showAi ? await admin.from("judge_ai_ratings").select("entry_id, rating, criteria") : { data: [] };
  // A rating made with other criteria than the enabled ones is flagged until notes are rewritten.
  const aiRating = new Map(
    (ratings.data ?? []).map((r) => [r.entry_id as string, { rating: r.rating as number, stale: !sameCriteria(r.criteria as string[] | null, enabled.keys) }]),
  );

  if (results.error) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Judging</h1>
        <p className="rounded border border-foreground/15 px-3 py-2 text-sm">
          The judging tables aren&apos;t in the database yet. Apply the <code>judge_core</code> and <code>judge_access</code>{" "}
          migrations, then reload.
        </p>
      </div>
    );
  }

  const rows = ((results.data ?? []) as Result[]).filter((r) => r.is_test === isTest);
  const late = (lateSaves.data ?? []).filter((l) => (l.saver as unknown as { is_test: boolean } | null)?.is_test === isTest);
  const overrides = new Map((entries.data ?? []).map((e) => [e.id as string, e.finalist_override as boolean | null]));
  // Who judges what: a group, or a judge in no group, judging alone (a one-person group).
  const judgeName = new Map(
    (judges.data ?? []).map((j) => [j.id as string, j.platform_role === "admin" ? `${j.display_name} (admin)` : (j.display_name as string)]),
  );
  const groupList = (groups.data ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    members: (memberships.data ?? []).filter((m) => m.group_id === g.id && judgeName.has(m.judge_id)).map((m) => m.judge_id as string),
  }));
  const groupOf = new Map(groupList.flatMap((g) => g.members.map((j) => [j, g.id] as const)));
  const unitOfJudge = (judgeId: string) => (groupOf.has(judgeId) ? `group:${groupOf.get(judgeId)}` : `judge:${judgeId}`);
  const unitOf = new Map<string, string>();
  for (const a of assignments.data ?? []) if (!unitOf.has(a.entry_id)) unitOf.set(a.entry_id, unitOfJudge(a.judge_id));
  const load = new Map<string, number>();
  for (const u of unitOf.values()) load.set(u, (load.get(u) ?? 0) + 1);
  const solo: JudgeOption[] = [...judgeName].filter(([j]) => !groupOf.has(j)).map(([id, name]) => ({ id, name }));
  const unitOptions: UnitOption[] = [
    ...groupList.map((g) => ({
      value: `group:${g.id}`,
      name: `${g.name}: ${g.members.map((j) => judgeName.get(j)).join(", ") || "no judges"}`,
      load: load.get(`group:${g.id}`) ?? 0,
    })),
    ...solo.map((j) => ({ value: `judge:${j.id}`, name: j.name, load: load.get(`judge:${j.id}`) ?? 0 })),
  ];
  const unitName = new Map(unitOptions.map((u) => [u.value, u.name]));

  // Group standings: each group's (or lone judge's) entries ranked by the mean of its judges'
  // entry scores, as judge_entry_results picks each group's finalist. For choosing extra
  // finalists, such as second places.
  type ScoreRow = { entry_id: string; judge_id: string; round: "prelim" | "final"; scores: number[]; criteria: string[] | null };
  const scoreRows = (allScores.data ?? []) as ScoreRow[];
  const judgeScore = new Map(scoreRows.filter((sc) => sc.round === "prelim").map((sc) => [`${sc.entry_id}:${sc.judge_id}`, mean(sc.scores)]));
  const resultById = new Map(rows.map((r) => [r.entry_id, r]));
  const unitEntries = new Map<string, Map<string, { judges: number; scores: number[] }>>();
  for (const a of assignments.data ?? []) {
    if (!resultById.has(a.entry_id)) continue;
    const unit = unitOfJudge(a.judge_id);
    const byEntry = unitEntries.get(unit) ?? new Map();
    const tally = byEntry.get(a.entry_id) ?? { judges: 0, scores: [] };
    tally.judges++;
    const score = judgeScore.get(`${a.entry_id}:${a.judge_id}`);
    if (score !== undefined && score !== null) tally.scores.push(score);
    byEntry.set(a.entry_id, tally);
    unitEntries.set(unit, byEntry);
  }
  // Final round: finalists by place, with each judge's final score (alphabetical columns). Judges
  // are everyone with the judge role in this world plus anyone else who scored a finalist.
  const finalists = rows
    .filter((r) => r.is_finalist)
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || Number(b.final_score ?? -1) - Number(a.final_score ?? -1) || a.team_name.localeCompare(b.team_name));
  const finalistIds = new Set(finalists.map((f) => f.entry_id));
  const finalScores = scoreRows.filter((sc) => sc.round === "final" && finalistIds.has(sc.entry_id));
  const finalKeys = ALL_CRITERIA.map((c) => c.key).filter((k) => finalScores.some((sc) => scoresByKey(sc).has(k)));
  const finalJudgeIds = new Set([
    ...(judges.data ?? []).filter((j) => j.platform_role === "judge").map((j) => j.id as string),
    ...finalScores.map((sc) => sc.judge_id),
  ]);
  const finalJudges = [...finalJudgeIds]
    .map((id) => ({ id, name: (judges.data ?? []).find((j) => j.id === id)?.display_name ?? "Former judge" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const finalRows: FinalRow[] = finalists.map((f) => ({
    entryId: f.entry_id,
    team: f.team_name,
    title: f.title,
    place: f.place,
    finalScore: f.final_score,
    votes: f.final_votes,
    byJudge: Object.fromEntries(
      finalScores
        .filter((sc) => sc.entry_id === f.entry_id)
        .map((sc) => {
          const byKey = scoresByKey(sc);
          return [sc.judge_id, { mean: mean(sc.scores) ?? 0, ratings: finalKeys.map((k) => byKey.get(k) ?? "–").join(" · ") }];
        }),
    ),
  }));

  const standings = unitOptions
    .filter((u) => unitEntries.has(u.value))
    .map((u) => ({
      ...u,
      ranked: rankByScore(
        [...unitEntries.get(u.value)!].map(([id, t]) => ({ result: resultById.get(id)!, judges: t.judges, scored: t.scores.length, groupMean: mean(t.scores) })),
        (e) => e.groupMean,
      ),
    }));

  const compare =
    sort === "judge"
      ? (a: Result, b: Result) => (unitName.get(unitOf.get(a.entry_id) ?? "") ?? "~").localeCompare(unitName.get(unitOf.get(b.entry_id) ?? "") ?? "~")
      : SORTS[sort];
  rows.sort((a, b) => compare(a, b) || a.team_name.localeCompare(b.team_name));

  const submittedCount = rows.filter((r) => r.submitted).length;
  const withoutSubmission = Math.max(0, (teams.count ?? 0) - rows.filter((r) => r.submitted && r.team_id).length);
  const unassigned = rows.filter((r) => r.submitted && !unitOf.has(r.entry_id)).length;
  const notesBy = new Map((aiNotes.data ?? []).map((n) => [n.entry_id as string, n.notes as Partial<AiNotesBody> | null]));
  const withNotes = new Set(notesBy.keys());
  const notedCount = rows.filter((r) => r.submitted && withNotes.has(r.entry_id)).length;
  const s = settings.data;

  const header = (key: SortKey, label: string) => (
    <th className={th}>
      <Link href={`/admin/judging?sort=${key}${worldParam}${aiParam}`} className={sort === key ? "font-semibold text-foreground" : "underline-offset-2 hover:underline"}>
        {label}
        {sort === key ? " ↓" : ""}
      </Link>
    </th>
  );

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Judging{isTest && " (test)"}</h1>
          <nav className="flex gap-1 text-sm">
            {[
              ["", "Real entries"],
              ["&world=test", "Test entries"],
            ].map(([param, label]) => (
              <Link
                key={label}
                href={`/admin/judging?sort=${sort}${param}${aiParam}`}
                className={`rounded px-2 py-1 ${param === worldParam ? "bg-foreground/10 font-medium" : "hover:bg-foreground/5"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {isTest && (
          <p className="text-sm text-foreground/70">
            Test teams, projects and judges from{" "}
            <Link href="/admin/test-accounts" className="underline">
              Test accounts
            </Link>
            . Only admins see them; test judges score them and get their own finalists and places. Publishing applies to
            real entries only.
          </p>
        )}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded bg-foreground/5 px-2 py-1">{submittedCount} submitted</span>
          <span className={`rounded px-2 py-1 ${withoutSubmission ? "bg-accent-soft" : "bg-foreground/5"}`}>
            Teams without a submission: {withoutSubmission}
          </span>
          <span className="rounded bg-foreground/5 px-2 py-1">{unassigned} submitted entries without a judge</span>
          <span className="rounded bg-foreground/5 px-2 py-1">{finalists.length} finalists</span>
          <span className="rounded bg-foreground/5 px-2 py-1">
            AI notes: {notedCount}/{submittedCount}
          </span>
          <Link href={`/admin/judging/scores${isTest ? "?world=test" : ""}`} className="rounded px-2 py-1 underline hover:bg-foreground/5">
            All scores by judge and team
          </Link>
        </div>
        <div className="space-y-1">
          <AiNotesForm world={isTest ? "test" : "real"} disabled={!aiNotesConfigured()} />
          <p className="text-xs text-foreground/60">
            Claude reads each submitted entry&apos;s text and its GitHub README (not the video, code, or live app) and writes
            what to focus on, 2–3 sentences per criterion, and what it couldn&apos;t tell. Judges see the notes collapsed on the
            entry page, with no scores. It also rates each entry for admins only, as an optional tie-breaker:{" "}
            <Link href={`/admin/judging?sort=${sort}${worldParam}${showAi ? "" : "&ai=1"}`} className="underline">
              {showAi ? "hide AI tie-break ratings" : "show AI tie-break ratings"}
            </Link>
            . Run it after submissions close, and again for entries that changed.
          </p>
        </div>
        {s && <p className="text-sm text-foreground/70">Submissions close {formatPacific(s.submissions_close_at)}. Change it on the Settings tab.</p>}
      </div>

      {finalRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Final standings</h2>
          <p className="text-sm text-foreground/70">
            Finalists by place: the mean of every judge&apos;s final-round score. &ldquo;Judges&rdquo; is how many have scored it.
          </p>
          <FinalStandings rows={finalRows} judges={finalJudges} legend={finalKeys.map(shortName).join(" · ")} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Criteria</h2>
        <p className="text-sm text-foreground/70">
          What judges score, each 1–8 with equal weight; an entry&apos;s score is the mean of the criteria on. Applies to
          both worlds: the score form, anchors, AI notes and the AI tie-break follow it.
        </p>
        {lock.locked ? (
          <p className="rounded bg-accent-soft px-2 py-1 text-sm">
            {lock.failed
              ? "Locked: couldn't check for scores, so the criteria can't change right now. Reload to try again."
              : `Locked: judges have saved ${lock.scores} real score${lock.scores === 1 ? "" : "s"}, and every score in a round must use the same criteria. Test-world scores don't lock it.`}
          </p>
        ) : (
          <p className="text-xs text-foreground/60">
            Choose before judging starts: this locks once a judge saves a real score (test-world scores don&apos;t count). After a
            change, click &ldquo;Write AI notes&rdquo; again so notes and tie-break ratings cover the new criteria.
          </p>
        )}
        <CriteriaForm
          criteria={ALL_CRITERIA.map((c) => ({ key: c.key, name: c.name, note: c.note, isDefault: DEFAULT_CRITERIA.includes(c.key) }))}
          enabled={enabled.keys}
          locked={lock.locked}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Judging groups</h2>
        <p className="text-sm text-foreground/70">
          Judges in a group score the same entries, and the group sends its top entry (by the mean of its judges&apos; scores) to the
          final. A judge in no group judges alone. Putting judges in a group gives the group every entry they already had; set up
          groups before assigning entries.
          {groups.error && " Groups aren't in the database yet: apply the judge_groups migration."}
        </p>
        {groupList.length > 0 && (
          <ul className="space-y-2">
            {groupList.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-foreground/15 px-3 py-2 text-sm">
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-foreground/60">{load.get(`group:${g.id}`) ?? 0} entries</span>
                <span className="flex grow flex-wrap gap-x-3 gap-y-1">
                  {g.members.length === 0 && <span className="text-foreground/60">No judges</span>}
                  {g.members.map((j) => (
                    <span key={j} className="inline-flex items-center gap-1">
                      {judgeName.get(j)}
                      <RemoveMemberButton groupId={g.id} judgeId={j} name={judgeName.get(j) ?? "this judge"} last={g.members.length === 1} />
                    </span>
                  ))}
                </span>
                <AddMemberForm groupId={g.id} judges={solo} />
                <DeleteGroupButton groupId={g.id} name={g.name} entries={load.get(`group:${g.id}`) ?? 0} />
              </li>
            ))}
          </ul>
        )}
        <CreateGroupForm key={groupList.length} world={isTest ? "test" : "real"} judges={solo} />
      </section>

      {standings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Group standings</h2>
          <p className="text-sm text-foreground/70">
            Each group&apos;s entries ranked by the mean of its judges&apos; scores. The top entry goes to the final automatically
            (an exact tie sends none); to add another, such as a second place, set its finalist to Yes. &ldquo;Judges&rdquo; is how
            many of the group&apos;s judges have scored it.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {standings.map((u) => (
              <div key={u.value} className="overflow-x-auto rounded border border-foreground/15">
                <p className="bg-foreground/5 px-3 py-2 text-sm font-medium">{u.name}</p>
                <table className="w-full text-left text-sm">
                  <thead className="text-foreground/70">
                    <tr>
                      <th className={`${th} pl-3`}>#</th>
                      <th className={th}>Team</th>
                      <th className={th}>Group mean</th>
                      <th className={th}>Judges</th>
                      <th className={th}>Finalist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.ranked.map((e) => (
                      <tr key={e.result.entry_id} className={`border-t border-foreground/10 ${e.result.is_finalist ? "bg-accent-soft/40" : ""}`}>
                        <td className={`${td} pl-3`}>
                          {e.rank ?? "–"}
                          {e.tied && <span className="block text-xs text-foreground/60">tie</span>}
                        </td>
                        <td className={td}>
                          <span className="font-medium">{e.result.team_name}</span>
                          <span className="block text-xs text-foreground/60">{e.result.title || "Untitled"}</span>
                        </td>
                        <td className={`${td} font-medium`}>{formatScore(e.groupMean)}</td>
                        <td className={td}>
                          {e.scored}/{e.judges}
                        </td>
                        <td className={td}>
                          <FinalistForm entryId={e.result.entry_id} override={overrides.get(e.result.entry_id) ?? null} isFinalist={e.result.is_finalist} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Entries</h2>
          <AutoAssignForm world={isTest ? "test" : "real"} />
        </div>
        <p className="text-sm text-foreground/70">
          Prelim: one group or judge per entry; each group&apos;s (or lone judge&apos;s) top-scored entry becomes a finalist (an
          exact tie makes none until a judge adjusts a score). Scores are the mean of {enabled.criteria.map((c) => c.name).join(", ")}.
          Override with the finalist column. Load:{" "}
          {unitOptions.length ? unitOptions.map((u) => `${u.name} ${u.load}`).join("; ") : "nobody has the judge role yet"}.
        </p>
        {!isTest && <FallbackEntryForm />}
        {rows.length === 0 ? (
          <p className="text-sm">No entries yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-foreground/15">
            <table className="w-full text-left text-sm">
              <thead className="bg-foreground/5 text-foreground/70">
                <tr>
                  {header("team", "Team")}
                  {header("submitted", "Submitted")}
                  {header("judge", "Judge or group")}
                  {header("prelim", "Prelim")}
                  {header("final", "Final")}
                  <th className={th}>Finalist</th>
                  {header("place", "Place")}
                  {showAi && <th className={th}>AI tie-break</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entry_id} className="border-t border-foreground/10">
                    <td className={`${td} pl-3`}>
                      <span className="font-medium">{r.team_name}</span>
                      <span className="block text-xs text-foreground/60">{r.title || "Untitled"}</span>
                      {!r.team_id && <span className="text-xs text-foreground/60">fallback entry</span>}
                      {withNotes.has(r.entry_id) && <AdminNotes notes={notesBy.get(r.entry_id) ?? null} />}
                    </td>
                    <td className={td}>
                      {r.last_saved_at ? formatPacific(r.last_saved_at) : <span className="text-foreground/50">not yet</span>}
                      {r.late && (
                        <span className="ml-1 rounded bg-accent-soft px-1 text-xs">{r.late_pending ? "late, pending" : "late"}</span>
                      )}
                    </td>
                    <td className={td}>
                      <JudgeForm entryId={r.entry_id} unit={unitOf.get(r.entry_id) ?? null} units={unitOptions} />
                    </td>
                    <td className={td}>
                      {formatScore(r.prelim_score)} <span className="text-xs text-foreground/50">({r.prelim_votes})</span>
                    </td>
                    <td className={td}>
                      {formatScore(r.final_score)} <span className="text-xs text-foreground/50">({r.final_votes})</span>
                    </td>
                    <td className={td}>
                      <FinalistForm entryId={r.entry_id} override={overrides.get(r.entry_id) ?? null} isFinalist={r.is_finalist} />
                    </td>
                    <td className={td}>{r.place ?? "—"}</td>
                    {showAi && (
                      <td className={td} title="Admin-only AI rating of the entry text and README. Never shown to judges, never added to scores.">
                        {formatScore(aiRating.get(r.entry_id)?.rating ?? null)}
                        {aiRating.get(r.entry_id)?.stale && <span className="block text-xs text-foreground/60">old criteria</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Late saves ({late.length})</h2>
        <p className="text-sm text-foreground/70">
          Saved after the deadline. Accept to replace the team&apos;s entry with this version; reject to keep the one saved on time.
        </p>
        {!late.length ? (
          <p className="text-sm">None waiting.</p>
        ) : (
          <ul className="space-y-2">
            {late.map((l) => {
              const team = (l.teams as unknown as { name: string } | null)?.name ?? "Unknown team";
              const saver = (l.saver as unknown as { display_name: string } | null)?.display_name ?? "someone";
              const title = (l.payload as { title?: string } | null)?.title ?? "";
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 rounded border border-foreground/15 px-3 py-2 text-sm">
                  <span className="grow">
                    <strong>{team}</strong>: “{title}” by {saver}, {formatPacific(l.saved_at)}
                  </span>
                  <form action={decideLateSave}>
                    <input type="hidden" name="late_id" value={l.id} />
                    <input type="hidden" name="decision" value="accepted" />
                    <SubmitButton className={small} pendingText="Accepting…">
                      Accept
                    </SubmitButton>
                  </form>
                  <form action={decideLateSave}>
                    <input type="hidden" name="late_id" value={l.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <SubmitButton className={small} pendingText="Rejecting…">
                      Reject
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!isTest && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Publish</h2>
          <p className="text-sm text-foreground/70">
            The public <Link href="/results" className="underline">results page</Link> shows only what&apos;s on here. Scores are never public.
          </p>
          {s && (
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["publish_finalists", "Finalists", s.publish_finalists],
                  ["publish_winners", "Winners and places", s.publish_winners],
                ] as const
              ).map(([field, label, on]) => (
                <form key={field} action={setPublish} className="flex items-center gap-2 rounded border border-foreground/15 px-3 py-2 text-sm">
                  <input type="hidden" name="field" value={field} />
                  <input type="hidden" name="value" value={on ? "false" : "true"} />
                  <span>
                    {label}: <strong>{on ? "published" : "hidden"}</strong>
                  </span>
                  <SubmitButton className={small} pendingText="Saving…">
                    {on ? "Hide" : "Publish"}
                  </SubmitButton>
                </form>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// The AI notes judges see for an entry, readable here so admins can check them in either world
// (test entries are hidden from real accounts on /judge). Never shows the tie-break rating.
function AdminNotes({ notes }: { notes: Partial<AiNotesBody> | null }) {
  const list = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
  const focus = list(notes?.focus);
  const criteria = list(notes?.criteria);
  const unknowns = list(notes?.unknowns);
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-foreground/70 underline underline-offset-2">AI notes: view</summary>
      <div className="mt-1 max-w-md space-y-2 rounded border border-foreground/15 p-2 text-foreground/80">
        {focus.length > 0 && (
          <div>
            <p className="font-medium">Focus on</p>
            <ul className="list-disc pl-4">{focus.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
        )}
        {criteria.map((c, i) => (
          <div key={i}>
            <p className="font-medium">{c.criterion}</p>
            <p>{c.note}</p>
          </div>
        ))}
        {unknowns.length > 0 && (
          <div>
            <p className="font-medium">AI couldn&apos;t tell</p>
            <ul className="list-disc pl-4">{unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul>
          </div>
        )}
      </div>
    </details>
  );
}
