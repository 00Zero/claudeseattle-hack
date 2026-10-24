import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EntryDetails } from "../../_components/entry-details";
import { PageHeader, Sig } from "../../_components/ui";
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
    <div className="space-y-10">
      <div className="space-y-4">
        <Link href="/judge" className="font-mono text-xs text-fg-muted no-underline hover:text-fg">
          ← all my entries
        </Link>
        <PageHeader eyebrow={`${entry.team} · ${round === "final" ? "Final round" : "Prelim"}`} title={entry.title || "Untitled"}>
          {round === "prelim" && isFinalist && (
            <p>
              <Link href={`/judge/${entry.id}?round=final`} className="underline">
                This is a finalist: score the final round
              </Link>
            </p>
          )}
        </PageHeader>
      </div>

      <section className="space-y-4">
        <Sig call="Read(entry.md)" title="The entry" />
        <EntryDetails entry={entry} roster={roster} />
      </section>

      {notes ? (
        // Collapsed by default (docs/REQUIREMENTS.md), so the summary has to look clickable.
        <details className="group rounded border border-accent bg-accent-soft/40 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-medium">AI notes: what to focus on</span>
              <span className="block text-fg-muted">What to check first, a note per criterion, and what the AI couldn&apos;t tell.</span>
            </span>
            <span className="shrink-0 rounded border border-line-strong px-2 py-0.5 text-xs font-medium">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <div className="mt-2 space-y-2 text-sm">
            <p className="text-fg-faint">
              Written by {notes.model} from the team&apos;s entry and README only: it didn&apos;t watch the video, read the code,
              or try the app. A starting point; you do the scoring.
            </p>
            {notes.focus.length > 0 && (
              <div className="rounded bg-accent-soft px-3 py-2">
                <p className="font-medium">Focus on</p>
                <ul className="list-disc pl-5">
                  {notes.focus.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {notes.criteria.map((n, i) => (
              <div key={i}>
                <p className="font-medium">{n.criterion}</p>
                <p className="text-fg-muted">{n.note}</p>
              </div>
            ))}
            {notes.unknowns.length > 0 && (
              <div className="rounded border border-line px-3 py-2">
                <p className="font-medium">AI couldn&apos;t tell; check these yourself</p>
                <ul className="list-disc pl-5 text-fg-muted">
                  {notes.unknowns.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      ) : (
        <p className="rounded border border-line px-3 py-2 text-sm text-fg-muted">
          No AI notes for this entry yet. Organizers write them after submissions close.
        </p>
      )}

      <section className="space-y-4 border-t border-line pt-8" aria-labelledby="score-heading">
        <Sig call={`Score(${round})`} title={`Your ${round === "final" ? "final-round" : "prelim"} score`} id="score-heading" />
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
