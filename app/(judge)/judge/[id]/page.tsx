import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EntryDetails } from "../../_components/entry-details";
import { CRITERIA } from "../../_lib/scoring";
import { saveScore } from "../actions";
import { ScoreForm } from "../_components/score-form";
import { getEntryForJudge, getJudgeViewer, type Round } from "../_lib/judge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /judge/[id]: the entry (video first), the AI notes collapsed, then my score form for the
// round in ?round= (prelim by default; final for finalists).
export default async function JudgeEntryPage({ params, searchParams }: PageProps<"/judge/[id]">) {
  const viewer = await getJudgeViewer();
  if (viewer.kind === "signed_out") redirect("/login");
  if (viewer.kind === "not_judge") notFound();

  const { id } = await params;
  const { round: roundParam } = await searchParams;
  if (!UUID.test(id)) notFound();
  const round: Round = roundParam === "final" ? "final" : "prelim";

  const data = await getEntryForJudge(viewer.id, id, round);
  if (!data) notFound();
  const { entry, roster, canScore, isAssigned, isFinalist, myScore, notes } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/judge" className="text-sm text-fg-muted underline">
          ← All my entries
        </Link>
        <h1 className="text-2xl font-semibold">{entry.title || "Untitled"}</h1>
        <p className="text-sm text-fg-muted">
          {entry.team} · {round === "final" ? "Final round" : "Prelim"}
          {round === "prelim" && isFinalist && (
            <>
              {" "}
              ·{" "}
              <Link href={`/judge/${entry.id}?round=final`} className="underline">
                score the final round
              </Link>
            </>
          )}
        </p>
      </div>

      <EntryDetails entry={entry} roster={roster} />

      {notes && (
        <details className="rounded border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">AI notes: what to dig into</summary>
          <div className="mt-2 space-y-2 text-sm">
            <p className="text-fg-faint">Written by {notes.model}. A starting point only; never added to your score.</p>
            {notes.notes.map((n, i) => (
              <div key={i}>
                <p className="font-medium">
                  {n.criterion}
                  {notes.draft_scores?.[i] ? <span className="font-normal text-fg-muted"> (draft {notes.draft_scores[i]})</span> : null}
                </p>
                <p className="text-fg-muted">{n.note}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="space-y-3 border-t border-line pt-6" aria-labelledby="score-heading">
        <h2 id="score-heading" className="text-lg font-semibold">
          Your {round === "final" ? "final-round" : "prelim"} score
        </h2>
        {canScore ? (
          <ScoreForm key={round} action={saveScore} entryId={entry.id} round={round} initial={myScore} />
        ) : (
          <p className="text-fg-muted">
            {round === "final"
              ? "This entry isn't a finalist, so there's no final-round score."
              : isAssigned
                ? "You can't score this entry."
                : "This entry isn't assigned to you, so you can read it but not score it."}
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-fg-muted">Rubric anchors</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-fg-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Criterion</th>
                <th className="py-1 pr-2 font-medium">1–2</th>
                <th className="py-1 pr-2 font-medium">3–4</th>
                <th className="py-1 pr-2 font-medium">5–6</th>
                <th className="py-1 font-medium">7–8</th>
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((c) => (
                <tr key={c.name} className="border-t border-line align-top">
                  <td className="py-1 pr-2 font-medium">{c.name}</td>
                  {c.anchors.map((a) => (
                    <td key={a} className="py-1 pr-2 text-fg-muted">
                      {a}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </div>
  );
}
