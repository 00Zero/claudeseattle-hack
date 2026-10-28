import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eventName, prizes } from "@/lib/event";
import { indexed } from "@/lib/site";
import { EntryGrid, type EntryCard } from "../_components/entry-grid";
import { PageHeader, Sig } from "../_components/ui";

export const metadata: Metadata = {
  title: "Winners and every project",
  description: `The winners of the ${eventName} in Seattle and every project, each free and open source on GitHub.`,
  robots: indexed,
  alternates: { canonical: "/results" },
};

// /results: public. Shows only what event_settings allows: finalists once "publish finalists"
// is on, places once "publish winners" is on. Never scores (public_judge_results has none).
export default async function ResultsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data }, { data: entryRows }] = await Promise.all([
    supabase.from("event_settings").select("publish_finalists, publish_winners").eq("id", 1).maybeSingle(),
    supabase.from("public_judge_results").select("entry_id, team_name, title, place"),
    // Every submitted entry; the view returns nothing until submissions close.
    supabase.from("public_judge_entries").select("id, team_name, title, tagline").order("team_name"),
  ]);
  const winners = Boolean(settings?.publish_winners);
  const rows = ((data ?? []) as { entry_id: string; team_name: string; title: string; place: number | null }[]).sort((a, b) =>
    winners ? (a.place ?? 99) - (b.place ?? 99) || a.team_name.localeCompare(b.team_name) : a.team_name.localeCompare(b.team_name),
  );

  // Every entry, with its place badge once winners are published.
  const places = new Map(rows.map((r) => [r.entry_id, r.place]));
  const entries = ((entryRows ?? []) as EntryCard[]).map((e) => ({ ...e, place: places.get(e.id) ?? null }));

  return (
    <div className="space-y-12">
      <PageHeader eyebrow={eventName} title="The" italic="results">
        {rows.length === 0 && <p>Finalists are announced after prelim judging, winners at 7:30 pm.</p>}
      </PageHeader>

      {rows.length > 0 && (
        <section className="space-y-4">
          <Sig call={winners ? "Read(winners.md)" : "Read(finalists.md)"} title={winners ? "Winners" : "Finalists"} />
          <ol className="border-b border-line">
            {rows.map((r) => (
              <li key={r.entry_id}>
                <Link
                  href={`/entries/${r.entry_id}`}
                  className="flex items-center gap-4 border-t border-line px-1 py-5 no-underline transition-colors hover:bg-fg/5"
                >
                  {winners && (
                    <span className={`w-10 text-center font-display text-4xl font-light leading-none ${r.place === 1 ? "text-accent" : "text-fg-muted"}`}>
                      {r.place ?? "–"}
                    </span>
                  )}
                  <span className="min-w-0 grow">
                    <span className="block font-display text-2xl font-light leading-snug">{r.title || r.team_name}</span>
                    <span className="block text-sm text-fg-muted">{r.team_name}</span>
                  </span>
                  {winners && r.place === 1 && <span className="eyebrow text-accent">Winner</span>}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-4">
        <Sig call="Read(prizes.md)" title="Prizes" />
        <div className="border-y border-line">
          <div className="flex flex-wrap items-baseline justify-between gap-2 py-4">
            <span className="font-display text-2xl font-light">{prizes.everyone.replace("Every participant gets ", "").replace(".", "")}</span>
            <span className="eyebrow">Every participant</span>
          </div>
          {prizes.winners.map((prize) => (
            <div key={prize} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-4">
              <span className="font-display text-xl font-light">{prize}</span>
              <span className="eyebrow">Winning team</span>
            </div>
          ))}
          {prizes.topThree.map((prize) => (
            <div key={prize} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-4">
              <span className="font-display text-xl font-light">{prize}</span>
              <span className="eyebrow">Top 3 teams</span>
            </div>
          ))}
        </div>
        <p className="rounded-lg bg-accent px-4 py-4 text-center font-display text-2xl font-light text-accent-fg">{prizes.winnersValue}</p>
      </section>

      {entries.length > 0 && (
        <section className="space-y-4">
          <Sig call="Read(entries.md)" title="Every entry" />
          <p className="text-fg-muted">Every project is open source on GitHub, so a small business can pick one up next week.</p>
          <EntryGrid entries={entries} />
        </section>
      )}
    </div>
  );
}
