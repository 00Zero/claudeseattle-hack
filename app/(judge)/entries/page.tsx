import { createClient } from "@/lib/supabase/server";
import { formatPacific } from "@/lib/time";
import { EntryGrid, type EntryCard } from "../_components/entry-grid";
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
  const entries = (data ?? []) as EntryCard[];

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
        <EntryGrid entries={entries} />
      )}
    </div>
  );
}
