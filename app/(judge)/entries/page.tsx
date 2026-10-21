import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPacific } from "@/lib/time";
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Entries</h1>
        <p className="text-sm text-fg-muted">Every project is open source on GitHub.</p>
      </div>
      {!isPast ? (
        <p className="text-fg-muted">Entries are public after submissions close, {formatPacific(closesAt)}.</p>
      ) : entries.length === 0 ? (
        <p className="text-fg-muted">No entries.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/entries/${e.id}`} className="block h-full rounded border border-line px-3 py-3 no-underline hover:border-line-strong">
                <span className="block font-medium">{e.title || e.team_name}</span>
                <span className="block text-sm text-fg-muted">{e.team_name}</span>
                {e.tagline && <span className="mt-1 block text-sm">{e.tagline}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
