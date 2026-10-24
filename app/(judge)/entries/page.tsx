import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPacific } from "@/lib/time";
import { PageHeader } from "../_components/ui";
import { getSubmissionDeadline } from "../submit/_lib/entry";

// /entries: public list of submitted entries, readable without login once submissions close
// (public_judge_entries returns nothing before then).
export default async function EntriesPage() {
  const supabase = await createClient();
  const [{ closesAt, isPast }, { data }] = await Promise.all([
    getSubmissionDeadline(),
    supabase.from("public_judge_entries").select("id, team_name, title, tagline").order("team_name"),
  ]);
  const entries = (data ?? []) as { id: string; team_name: string; title: string; tagline: string | null }[];

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Claude Impact Lab · open source" title="Every" italic="entry">
        <p>Every project is open source on GitHub, so a small business can pick one up next week.</p>
      </PageHeader>
      {!isPast ? (
        <p className="text-fg-muted">Entries are public after submissions close, {formatPacific(closesAt)}.</p>
      ) : entries.length === 0 ? (
        <p className="text-fg-muted">No entries.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/entries/${e.id}`} className="block h-full rounded-lg border border-line bg-bg-raised p-4 no-underline transition-colors hover:border-accent">
                <span className="block font-display text-2xl font-light leading-snug">{e.title || e.team_name}</span>
                <span className="eyebrow mt-1 block">{e.team_name}</span>
                {e.tagline && <span className="mt-1 block text-sm">{e.tagline}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
