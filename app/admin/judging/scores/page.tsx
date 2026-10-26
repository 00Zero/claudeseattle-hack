import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPacific } from "@/lib/time";
import { ALL_CRITERIA, formatScore, mean, scoresByKey, shortName } from "@/app/(judge)/_lib/scoring";

// Admin: every judge's scores, both rounds, by judge or by team. Reads judge_scores with the
// service role after the admin check; never shown to judges or the public.

type Score = { entry_id: string; judge_id: string; round: "prelim" | "final"; scores: number[]; criteria: string[] | null; comment: string | null; updated_at: string };
type Entry = { entry_id: string; team_name: string; title: string; prelim_score: string | null; final_score: string | null; is_finalist: boolean; is_test: boolean };

const th = "px-2 py-1.5 font-medium";
const td = "px-2 py-1.5 align-top";

export default async function JudgingScoresPage({ searchParams }: PageProps<"/admin/judging/scores">) {
  await requireAdminPage();
  const { world, by } = await searchParams;
  const isTest = world === "test";
  const byTeam = by === "team";
  const worldParam = isTest ? "&world=test" : "";

  const admin = createAdminClient();
  const [scores, results, judges, groups, memberships] = await Promise.all([
    admin.from("judge_scores").select("entry_id, judge_id, round, scores, criteria, comment, updated_at"),
    admin.from("judge_entry_results").select("entry_id, team_name, title, prelim_score, final_score, is_finalist, is_test").eq("is_test", isTest),
    admin.from("profiles").select("id, display_name").eq("is_test", isTest).in("platform_role", ["judge", "admin"]),
    admin.from("judge_groups").select("id, name"),
    admin.from("judge_group_members").select("judge_id, group_id"),
  ]);

  const entries = new Map(((results.data ?? []) as Entry[]).map((e) => [e.entry_id, e]));
  const rows = ((scores.data ?? []) as Score[]).filter((s) => entries.has(s.entry_id));
  const groupName = new Map((groups.data ?? []).map((g) => [g.id as string, g.name as string]));
  const groupOf = new Map((memberships.data ?? []).map((m) => [m.judge_id as string, groupName.get(m.group_id) ?? null]));
  const judgeName = new Map((judges.data ?? []).map((j) => [j.id as string, j.display_name as string]));
  for (const s of rows) if (!judgeName.has(s.judge_id)) judgeName.set(s.judge_id, "Former judge");
  // Columns: every criterion any shown score covers, in rubric order.
  const used = new Set(rows.flatMap((s) => [...scoresByKey(s).keys()]));
  const columns = ALL_CRITERIA.filter((c) => used.has(c.key));

  const judgeLabel = (id: string) => `${judgeName.get(id)}${groupOf.get(id) ? ` · ${groupOf.get(id)}` : ""}`;
  const entryLabel = (id: string) => entries.get(id)?.team_name ?? "Entry";
  const scoredEntries = new Set(rows.map((s) => s.entry_id));
  // By team, entries nobody has scored yet go on one line under the tables instead of a section each.
  const unscored = byTeam ? [...entries.values()].filter((e) => !scoredEntries.has(e.entry_id)).map((e) => e.team_name).sort() : [];
  const sections = byTeam
    ? [...entries.values()]
        .filter((e) => scoredEntries.has(e.entry_id))
        .sort((a, b) => a.team_name.localeCompare(b.team_name))
        .map((e) => ({
          key: e.entry_id,
          title: e.team_name,
          note: [e.title, `prelim ${formatScore(e.prelim_score)}`, `final ${formatScore(e.final_score)}`, e.is_finalist ? "finalist" : null].filter(Boolean).join(" · "),
          rows: rows.filter((s) => s.entry_id === e.entry_id),
        }))
    : [...judgeName.keys()]
        .sort((a, b) => judgeLabel(a).localeCompare(judgeLabel(b)))
        .map((j) => {
          const mine = rows.filter((s) => s.judge_id === j);
          return { key: j, title: judgeLabel(j), note: `${mine.filter((s) => s.round === "prelim").length} prelim, ${mine.filter((s) => s.round === "final").length} final`, rows: mine };
        });

  const tab = (param: string, label: string, on: boolean) => (
    <Link key={label} href={`/admin/judging/scores?${param}`} className={`rounded px-2 py-1 ${on ? "bg-foreground/10 font-medium" : "hover:bg-foreground/5"}`}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={`/admin/judging${isTest ? "?world=test" : ""}`} className="text-sm underline">
          ← Judging
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">All scores{isTest && " (test)"}</h1>
          <nav className="flex flex-wrap gap-1 text-sm">
            {tab(`by=judge${worldParam}`, "By judge", !byTeam)}
            {tab(`by=team${worldParam}`, "By team", byTeam)}
            <span className="mx-1 border-l border-foreground/15" />
            {tab(`by=${byTeam ? "team" : "judge"}`, "Real entries", !isTest)}
            {tab(`by=${byTeam ? "team" : "judge"}&world=test`, "Test entries", isTest)}
          </nav>
        </div>
        <p className="text-sm text-foreground/70">
          Every saved score, prelim and final, with each criterion (1–8), the judge&apos;s mean, and their comment. Admins only. An
          entry&apos;s prelim and final scores are the mean of these across judges.
        </p>
      </div>

      {scores.error ? (
        <p className="text-sm text-red-600">Couldn&apos;t load scores: {scores.error.message}</p>
      ) : (
        sections.map((sec) => (
          <section key={sec.key} className="space-y-2">
            <h2 className="flex flex-wrap items-baseline gap-x-3 text-lg font-semibold">
              {sec.title}
              <span className="text-sm font-normal text-foreground/60">{sec.note}</span>
            </h2>
            {sec.rows.length === 0 ? (
              <p className="text-sm text-foreground/60">No scores yet.</p>
            ) : (
              <div className="overflow-x-auto rounded border border-foreground/15">
                <table className="w-full text-left text-sm">
                  <thead className="bg-foreground/5 text-foreground/70">
                    <tr>
                      <th className={`${th} pl-3`}>{byTeam ? "Judge" : "Team"}</th>
                      <th className={th}>Round</th>
                      {columns.map((c) => (
                        <th key={c.key} className={th} title={c.name}>
                          {shortName(c.key)}
                        </th>
                      ))}
                      <th className={th}>Mean</th>
                      <th className={th}>Comment</th>
                      <th className={th}>Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sec.rows]
                      .sort((a, b) => a.round.localeCompare(b.round) * -1 || (byTeam ? judgeLabel(a.judge_id).localeCompare(judgeLabel(b.judge_id)) : entryLabel(a.entry_id).localeCompare(entryLabel(b.entry_id))))
                      .map((s) => {
                        const byKey = scoresByKey(s);
                        return (
                          <tr key={`${s.entry_id}:${s.judge_id}:${s.round}`} className="border-t border-foreground/10">
                            <td className={`${td} pl-3`}>
                              {byTeam ? (
                                judgeLabel(s.judge_id)
                              ) : (
                                <>
                                  <span className="font-medium">{entryLabel(s.entry_id)}</span>
                                  <span className="block text-xs text-foreground/60">{entries.get(s.entry_id)?.title || "Untitled"}</span>
                                </>
                              )}
                            </td>
                            <td className={td}>{s.round}</td>
                            {columns.map((c) => (
                              <td key={c.key} className={td}>
                                {byKey.get(c.key) ?? "—"}
                              </td>
                            ))}
                            <td className={`${td} font-medium`}>{formatScore(mean(s.scores))}</td>
                            <td className={`${td} max-w-xs text-xs text-foreground/80`}>{s.comment ?? ""}</td>
                            <td className={`${td} whitespace-nowrap text-xs text-foreground/60`}>{formatPacific(s.updated_at)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
      {unscored.length > 0 && (
        <p className="text-sm text-foreground/60">
          No scores yet ({unscored.length}): {unscored.join(", ")}.
        </p>
      )}
    </div>
  );
}
