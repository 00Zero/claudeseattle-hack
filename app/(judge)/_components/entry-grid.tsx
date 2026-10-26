import Link from "next/link";
import { placeLabel } from "@/lib/event";

// place: the finalist's place once winners are published (public_judge_results); shown as a badge.
export type EntryCard = { id: string; team_name: string; title: string; tagline: string | null; place?: number | null };

// The card grid on /entries and under the prizes on /results.
export function EntryGrid({ entries }: { entries: EntryCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {entries.map((e) => (
        <li key={e.id}>
          <Link href={`/entries/${e.id}`} className="block h-full rounded-lg border border-line bg-bg-raised p-4 no-underline transition-colors hover:border-accent">
            {e.place && <span className="eyebrow mb-1 block text-accent">{placeLabel(e.place)}</span>}
            <span className="block font-display text-2xl font-light leading-snug">{e.title || e.team_name}</span>
            <span className="eyebrow mt-1 block">{e.team_name}</span>
            {e.tagline && <span className="mt-1 block text-sm">{e.tagline}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
