import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mark, PageHeader, Sig, StatusPanel } from "../_components/ui";
import { getEnabledCriteria } from "../_lib/criteria";
import { countWord, formatScore, mean } from "../_lib/scoring";
import { getFinalRound, getJudgeViewer, getMyGroup } from "./_lib/judge";

// /judge: my assigned entries ranked by my mean score (the top one is my finalist), then the
// final round, where every judge scores every finalist. Built for a phone.

const row = "flex items-center gap-4 border-t border-line px-1 py-4 no-underline transition-colors hover:bg-fg/5";

export default async function JudgePage() {
  const viewer = await getJudgeViewer();
  if (viewer.kind === "signed_out") redirect("/login");
  if (viewer.kind === "not_judge") notFound();

  const [group, final, { criteria }] = await Promise.all([getMyGroup(viewer.id), getFinalRound(viewer.id), getEnabledCriteria()]);
  if (!group.ok || !final.ok) {
    return (
      <PageHeader eyebrow="Judging" title="Not set up" italic="yet">
        <p>Check back once entries are assigned.</p>
      </PageHeader>
    );
  }

  const top = group.ranked[0];
  const tiedAtTop = top?.tied && top.rank === 1;
  const finalScored = final.finalists.filter((f) => f.myScore).length;

  return (
    <div className="space-y-12">
      <div className="grid gap-8 md:grid-cols-[1fr_minmax(0,18rem)] md:items-end">
        <PageHeader eyebrow={`Judging · ${viewer.name}`} title="Your" italic="judging">
          <p>
            Score each entry on {countWord(criteria.length)} criteri{criteria.length === 1 ? "on" : "a"} ({criteria.map((c) => c.name).join(", ")}), 1–8
            each. Your entry score is the mean; your highest-scored entry goes to the final.
          </p>
        </PageHeader>
        <StatusPanel
          label="Where you are"
          rows={[
            {
              k: "prelim",
              v: `${group.scoredCount}/${group.ranked.length} scored`,
              tone: group.ranked.length && group.scoredCount === group.ranked.length ? "ok" : "accent",
            },
            {
              k: "final round",
              v: final.finalists.length ? `${finalScored}/${final.finalists.length} scored` : "no finalists yet",
              tone: final.finalists.length ? (final.allScored ? "ok" : "accent") : "muted",
            },
            { k: "standings", v: final.allScored ? "unlocked" : "locked", tone: final.allScored ? "ok" : "muted" },
          ]}
        />
      </div>

      <section className="space-y-4" aria-labelledby="prelim-heading">
        <Sig call="Read(prelim.md)" title="Your entries" id="prelim-heading" />
        {tiedAtTop && (
          <p className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm" role="status">
            <strong>Tie at the top.</strong> Two entries have the same score, so neither goes to the final yet. Adjust a score to
            break the tie.
          </p>
        )}
        {group.ranked.length === 0 ? (
          <p className="text-fg-muted">No entries assigned to you yet.</p>
        ) : (
          <ol className="border-b border-line">
            {group.ranked.map((e) => (
              <li key={e.id}>
                <Link href={`/judge/${e.id}`} className={row}>
                  <span className="w-6 text-center font-mono text-sm text-fg-faint">{e.rank ?? "–"}</span>
                  <span className="min-w-0 grow">
                    <span className="flex items-center gap-2 font-display text-xl font-light leading-snug">
                      {e.title || "Untitled"}
                      {e.id === group.finalistId && <Mark label="Your finalist" />}
                    </span>
                    <span className="block text-sm text-fg-muted">{e.team}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-3xl font-light leading-none">{formatScore(e.score)}</span>
                    <span className="mt-1 block font-mono text-xs">
                      {e.id === group.finalistId ? (
                        <span className="text-accent">your finalist</span>
                      ) : e.tied ? (
                        <span className="text-clay">tied</span>
                      ) : !e.myScore ? (
                        <span className="text-fg-faint">not scored</span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="final-heading">
        <Sig call="Read(finals.md)" title="Final round" id="final-heading" />
        <p className="text-sm text-fg-muted">Every judge scores every finalist during the live demos.</p>
        {final.finalists.length === 0 ? (
          <p className="text-fg-muted">No finalists yet. Each judge&apos;s top prelim entry appears here once they&apos;ve scored their group.</p>
        ) : (
          <>
            <ul className="border-b border-line">
              {final.finalists.map((f) => (
                <li key={f.id}>
                  <Link href={`/judge/${f.id}?round=final`} className={row}>
                    <span className="min-w-0 grow">
                      <span className="block font-display text-xl font-light leading-snug">{f.title || "Untitled"}</span>
                      <span className="block text-sm text-fg-muted">{f.team}</span>
                    </span>
                    <span className="text-right">
                      {f.myScore ? (
                        <span className="font-display text-3xl font-light leading-none">{formatScore(mean(f.myScore.scores))}</span>
                      ) : (
                        <span className="font-mono text-xs text-accent">score it</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {final.allScored ? (
              <Link href="/judge/results" className="btn">
                See the final standings
              </Link>
            ) : (
              <p className="font-mono text-xs text-fg-faint">Standings unlock once you&apos;ve scored every finalist.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
