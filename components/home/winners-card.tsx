import Link from "next/link";

export type Winner = { prize: string; entryId: string; title: string };

// The top three and the audience choice, under the photo card once winners are published.
// Prize names in clay, project names in the body color.
export function WinnersCard({ winners }: { winners: Winner[] }) {
  return (
    <section aria-label="Winners" className="grid gap-3 rounded-lg border border-line bg-bg-raised p-4">
      <span className="font-mono text-xs text-fg-faint">Winners</span>
      <ol className="grid gap-2.5">
        {winners.map((w) => (
          <li key={`${w.prize}-${w.entryId}`}>
            <Link href={`/entries/${w.entryId}`} className="grid gap-0.5 no-underline sm:grid-cols-[8.5rem_1fr] sm:items-baseline sm:gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-accent">{w.prize}</span>
              <span className="font-display text-xl font-light leading-snug text-fg">{w.title}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Link href="/results" className="justify-self-start font-mono text-xs text-fg-muted">
        Every project →
      </Link>
    </section>
  );
}
