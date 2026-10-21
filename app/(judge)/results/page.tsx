import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eventName, prizes } from "@/lib/event";

// /results: public. Shows only what event_settings allows: finalists once "publish finalists"
// is on, places once "publish winners" is on. Never scores (public_judge_results has none).
export default async function ResultsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data }] = await Promise.all([
    supabase.from("event_settings").select("publish_finalists, publish_winners").eq("id", 1).maybeSingle(),
    supabase.from("public_judge_results").select("entry_id, team_name, title, place"),
  ]);
  const winners = Boolean(settings?.publish_winners);
  const rows = ((data ?? []) as { entry_id: string; team_name: string; title: string; place: number | null }[]).sort((a, b) =>
    winners ? (a.place ?? 99) - (b.place ?? 99) || a.team_name.localeCompare(b.team_name) : a.team_name.localeCompare(b.team_name),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Results</h1>
        <p className="text-sm text-fg-muted">{eventName}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-fg-muted">Results aren&apos;t out yet. Finalists are announced after prelim judging, winners at 7:30 pm.</p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{winners ? "Winners" : "Finalists"}</h2>
          <ol className="space-y-2">
            {rows.map((r) => (
              <li key={r.entry_id}>
                <Link href={`/entries/${r.entry_id}`} className="flex items-center gap-3 rounded border border-line px-3 py-3 no-underline hover:border-line-strong">
                  {winners && <span className="w-8 text-center text-lg font-semibold">{r.place ?? "–"}</span>}
                  <span className="grow">
                    <span className="block font-medium">{r.title || r.team_name}</span>
                    <span className="block text-sm text-fg-muted">{r.team_name}</span>
                  </span>
                  {winners && r.place === 1 && <span className="text-sm font-medium text-evergreen">Winner</span>}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-1 text-sm text-fg-muted">
        <p>{prizes.everyone}</p>
        <p>The winning team gets: {prizes.winners.join("; ")}.</p>
        <p>
          <Link href="/entries" className="underline">
            Browse every entry
          </Link>
        </p>
      </section>
    </div>
  );
}
