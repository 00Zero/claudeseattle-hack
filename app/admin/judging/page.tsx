import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";
import { formatScore } from "@/app/(judge)/_lib/scoring";
import { SubmitButton } from "../submit-button";
import { autoAssign, decideLateSave, setPublish } from "./actions";
import { aiNotesConfigured } from "@/app/(judge)/_lib/ai-notes";
import { AiNotesForm, FallbackEntryForm, FinalistForm, JudgeForm, type JudgeOption } from "./row-forms";

// Admin judging: one row per entry with its judge, scores, finalist, and place; late saves to
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
  const { sort: sortParam, world } = await searchParams;
  const sort: SortKey = typeof sortParam === "string" && sortParam in SORTS ? (sortParam as SortKey) : "team";
  // Test accounts' teams, entries and judges (lib/test-accounts.ts) are a separate world:
  // ?world=test shows them instead of the real ones. Nothing mixes across.
  const isTest = world === "test";
  const worldParam = isTest ? "&world=test" : "";

  const admin = createAdminClient();
  const [results, entries, assignments, judges, teams, lateSaves, settings, aiNotes] = await Promise.all([
    admin.from("judge_entry_results").select("*"),
    admin.from("judge_entries").select("id, finalist_override"),
    admin.from("judge_assignments").select("entry_id, judge_id"),
    admin
      .from("profiles")
      .select("id, display_name, platform_role")
      .in("platform_role", ["judge", "admin"])
      .eq("is_test", isTest)
      .order("display_name"),
    admin.from("teams").select("id, leader:profiles!teams_leader_id_fkey!inner(is_test)", { count: "exact", head: true }).eq("leader.is_test", isTest),
    admin
      .from("judge_late_saves")
      .select("id, saved_at, payload, teams(name), saver:profiles!judge_late_saves_saved_by_fkey(display_name, is_test)")
      .eq("decision", "pending")
      .order("saved_at"),
    admin.from("event_settings").select("submissions_close_at, publish_finalists, publish_winners").eq("id", 1).single(),
    admin.from("judge_ai_notes").select("entry_id"),
  ]);

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
  const judgeOf = new Map((assignments.data ?? []).map((a) => [a.entry_id as string, a.judge_id as string]));
  const load = new Map<string, number>();
  for (const a of assignments.data ?? []) load.set(a.judge_id, (load.get(a.judge_id) ?? 0) + 1);
  const judgeOptions: JudgeOption[] = (judges.data ?? []).map((j) => ({
    id: j.id,
    name: j.platform_role === "admin" ? `${j.display_name} (admin)` : j.display_name,
    load: load.get(j.id) ?? 0,
  }));
  const judgeName = new Map(judgeOptions.map((j) => [j.id, j.name]));

  const compare =
    sort === "judge"
      ? (a: Result, b: Result) => (judgeName.get(judgeOf.get(a.entry_id) ?? "") ?? "~").localeCompare(judgeName.get(judgeOf.get(b.entry_id) ?? "") ?? "~")
      : SORTS[sort];
  rows.sort((a, b) => compare(a, b) || a.team_name.localeCompare(b.team_name));

  const submittedCount = rows.filter((r) => r.submitted).length;
  const withoutSubmission = Math.max(0, (teams.count ?? 0) - rows.filter((r) => r.submitted && r.team_id).length);
  const unassigned = rows.filter((r) => r.submitted && !judgeOf.has(r.entry_id)).length;
  const finalists = rows.filter((r) => r.is_finalist);
  const withNotes = new Set((aiNotes.data ?? []).map((n) => n.entry_id as string));
  const notedCount = rows.filter((r) => r.submitted && withNotes.has(r.entry_id)).length;
  const s = settings.data;

  const header = (key: SortKey, label: string) => (
    <th className={th}>
      <Link href={`/admin/judging?sort=${key}${worldParam}`} className={sort === key ? "font-semibold text-foreground" : "underline-offset-2 hover:underline"}>
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
                href={`/admin/judging?sort=${sort}${param}`}
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
        </div>
        <div className="space-y-1">
          <AiNotesForm world={isTest ? "test" : "real"} disabled={!aiNotesConfigured()} />
          <p className="text-xs text-foreground/60">
            Claude reads each submitted entry and its README and writes 2–3 sentences per criterion plus a draft score. Judges
            see them collapsed on the entry page; never public, never added to scores. Run it after submissions close, and
            again for entries that changed.
          </p>
        </div>
        {s && <p className="text-sm text-foreground/70">Submissions close {formatPacific(s.submissions_close_at)}. Change it on the Settings tab.</p>}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">Entries</h2>
          <form action={autoAssign}>
            <input type="hidden" name="world" value={isTest ? "test" : "real"} />
            <SubmitButton className={small} pendingText="Assigning…">
              Auto-assign entries without a judge
            </SubmitButton>
          </form>
        </div>
        <p className="text-sm text-foreground/70">
          Prelim: one judge per entry; each judge&apos;s top-scored entry becomes a finalist (an exact tie makes none until the
          judge adjusts a score). Override with the finalist column. Judges and their load:{" "}
          {judgeOptions.length ? judgeOptions.map((j) => `${j.name} ${j.load}`).join(", ") : "nobody has the judge role yet"}.
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
                  {header("judge", "Judge")}
                  {header("prelim", "Prelim")}
                  {header("final", "Final")}
                  <th className={th}>Finalist</th>
                  {header("place", "Place")}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entry_id} className="border-t border-foreground/10">
                    <td className={`${td} pl-3`}>
                      <span className="font-medium">{r.team_name}</span>
                      <span className="block text-xs text-foreground/60">{r.title || "Untitled"}</span>
                      {!r.team_id && <span className="text-xs text-foreground/60">fallback entry</span>}
                      {withNotes.has(r.entry_id) && <span className="ml-1 text-xs text-foreground/50">· AI notes</span>}
                    </td>
                    <td className={td}>
                      {r.last_saved_at ? formatPacific(r.last_saved_at) : <span className="text-foreground/50">not yet</span>}
                      {r.late && (
                        <span className="ml-1 rounded bg-accent-soft px-1 text-xs">{r.late_pending ? "late, pending" : "late"}</span>
                      )}
                    </td>
                    <td className={td}>
                      <JudgeForm entryId={r.entry_id} judgeId={judgeOf.get(r.entry_id) ?? null} judges={judgeOptions} />
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
