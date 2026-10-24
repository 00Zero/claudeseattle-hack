import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components/ui";
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
    <div className="space-y-10">
      <div className="space-y-4">
        <Link href="/judge" className="font-mono text-xs text-fg-muted no-underline hover:text-fg">
          ← judging
        </Link>
        <PageHeader eyebrow="Judges only · not public" title="Final" italic="standings">
          <p>Mean final score across judges. Not public until an organizer publishes winners.</p>
        </PageHeader>
      </div>

      {!final.ok || final.finalists.length === 0 ? (
        <p className="text-fg-muted">No finalists yet.</p>
      ) : remaining > 0 ? (
        <p className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
          Score {remaining === 1 ? "the last finalist" : `the remaining ${remaining} finalists`} first, so you don&apos;t see other judges&apos;
          scores before giving yours.{" "}
          <Link href="/judge" className="underline">
            Back to judging
          </Link>
        </p>
      ) : (
        <ol className="border-b border-line">
          {standings.map((s) => (
            <li key={s.entry_id} className="flex items-center gap-4 border-t border-line px-1 py-5">
              <span className={`w-10 text-center font-display text-4xl font-light leading-none ${s.place === 1 ? "text-accent" : "text-fg-muted"}`}>
                {s.place ?? "–"}
              </span>
              <span className="min-w-0 grow">
                <span className="block font-display text-2xl font-light leading-snug">{s.title || "Untitled"}</span>
                <span className="block text-sm text-fg-muted">{s.team_name}</span>
              </span>
              <span className="text-right">
                <span className="block font-display text-3xl font-light leading-none">{formatScore(s.final_score)}</span>
                <span className="mt-1 block font-mono text-xs text-fg-faint">
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
