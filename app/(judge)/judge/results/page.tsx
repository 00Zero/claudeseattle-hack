import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatScore } from "../../_lib/scoring";
import { getFinalRound, getJudgeViewer } from "../_lib/judge";

// /judge/results: finalists ranked by mean final score with how many judges scored each.
// judge_final_standings() returns nothing until I've scored every finalist, so nobody anchors
// on other judges' scores. Prelim scores from other groups are never shown. The panel checks
// this before Adam flips "publish winners".
export default async function JudgeResultsPage() {
  const viewer = await getJudgeViewer();
  if (viewer.kind === "signed_out") redirect("/login");
  if (viewer.kind === "not_judge") notFound();

  const final = await getFinalRound(viewer.id);
  const supabase = await createClient();
  const { data } = final.ok && final.allScored ? await supabase.rpc("judge_final_standings") : { data: null };
  const standings = (data ?? []) as { entry_id: string; team_name: string; title: string; final_score: string | null; final_votes: number; place: number | null }[];
  const remaining = final.ok ? final.finalists.filter((f) => !f.myScore).length : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/judge" className="text-sm text-fg-muted underline">
          ← Judging
        </Link>
        <h1 className="text-2xl font-semibold">Final standings</h1>
        <p className="text-sm text-fg-muted">Mean final score across judges. Not public until an organizer publishes winners.</p>
      </div>

      {!final.ok || final.finalists.length === 0 ? (
        <p className="text-fg-muted">No finalists yet.</p>
      ) : remaining > 0 ? (
        <p className="rounded border border-line px-3 py-2 text-sm">
          Score {remaining === 1 ? "the last finalist" : `the remaining ${remaining} finalists`} first, so you don&apos;t see other judges&apos;
          scores before giving yours.{" "}
          <Link href="/judge" className="underline">
            Back to judging
          </Link>
        </p>
      ) : (
        <ol className="space-y-2">
          {standings.map((s) => (
            <li key={s.entry_id} className="flex items-center gap-3 rounded border border-line px-3 py-3">
              <span className="w-6 text-center text-lg font-semibold">{s.place ?? "–"}</span>
              <span className="grow">
                <span className="block font-medium">{s.title || "Untitled"}</span>
                <span className="block text-sm text-fg-muted">{s.team_name}</span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-semibold">{formatScore(s.final_score)}</span>
                <span className="block text-xs text-fg-muted">
                  {s.final_votes} judge{s.final_votes === 1 ? "" : "s"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
