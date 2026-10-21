import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatScore, mean } from "../_lib/scoring";
import { getFinalRound, getJudgeViewer, getMyGroup } from "./_lib/judge";

// /judge: my assigned entries ranked by my mean score (the top one is my finalist), then the
// final round, where every judge scores every finalist. Built for a phone.
export default async function JudgePage() {
  const viewer = await getJudgeViewer();
  if (viewer.kind === "signed_out") redirect("/login");
  if (viewer.kind === "not_judge") notFound();

  const [group, final] = await Promise.all([getMyGroup(viewer.id), getFinalRound(viewer.id)]);
  if (!group.ok || !final.ok) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Judging</h1>
        <p className="text-fg-muted">Judging isn&apos;t set up yet. Check back once entries are assigned.</p>
      </div>
    );
  }

  const top = group.ranked[0];
  const tiedAtTop = top?.tied && top.rank === 1;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Judging</h1>
        <p className="text-sm text-fg-muted">Score each entry on the four criteria, 1–8 each. Your entry score is the mean.</p>
      </div>

      <section className="space-y-3" aria-labelledby="prelim-heading">
        <div className="space-y-1">
          <h2 id="prelim-heading" className="text-lg font-semibold">
            Prelim: your entries ({group.scoredCount}/{group.ranked.length} scored)
          </h2>
          <p className="text-sm text-fg-muted">Your highest-scored entry goes to the final.</p>
        </div>
        {tiedAtTop && (
          <p className="rounded border border-accent bg-accent-soft px-3 py-2 text-sm" role="status">
            <strong>Tie at the top.</strong> Two entries have the same score, so neither goes to the final yet. Adjust a score to
            break the tie.
          </p>
        )}
        {group.ranked.length === 0 ? (
          <p className="text-fg-muted">No entries assigned to you yet.</p>
        ) : (
          <ol className="space-y-2">
            {group.ranked.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/judge/${e.id}`}
                  className="flex items-center gap-3 rounded border border-line px-3 py-3 no-underline hover:border-line-strong"
                >
                  <span className="w-6 text-center text-fg-muted">{e.rank ?? "–"}</span>
                  <span className="grow">
                    <span className="block font-medium">{e.title || "Untitled"}</span>
                    <span className="block text-sm text-fg-muted">{e.team}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-semibold">{formatScore(e.score)}</span>
                    {e.id === group.finalistId && <span className="block text-xs font-medium text-evergreen">your finalist</span>}
                    {e.tied && <span className="block text-xs text-clay">tied</span>}
                    {!e.myScore && <span className="block text-xs text-fg-muted">not scored</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="final-heading">
        <div className="space-y-1">
          <h2 id="final-heading" className="text-lg font-semibold">Final round</h2>
          <p className="text-sm text-fg-muted">Every judge scores every finalist during the live demos.</p>
        </div>
        {final.finalists.length === 0 ? (
          <p className="text-fg-muted">No finalists yet. They appear here once every judge has picked one.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {final.finalists.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/judge/${f.id}?round=final`}
                    className="flex items-center gap-3 rounded border border-line px-3 py-3 no-underline hover:border-line-strong"
                  >
                    <span className="grow">
                      <span className="block font-medium">{f.title || "Untitled"}</span>
                      <span className="block text-sm text-fg-muted">{f.team}</span>
                    </span>
                    <span className="text-right">
                      {f.myScore ? (
                        <span className="text-lg font-semibold">{formatScore(mean(f.myScore.scores))}</span>
                      ) : (
                        <span className="text-sm text-fg-muted">not scored</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {final.allScored ? (
                <Link href="/judge/results" className="underline">
                  See the final standings
                </Link>
              ) : (
                <span className="text-fg-muted">Standings unlock once you&apos;ve scored every finalist.</span>
              )}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
