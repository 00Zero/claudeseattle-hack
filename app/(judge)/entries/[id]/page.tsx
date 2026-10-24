import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EntryDetails, type EntryDetailsData } from "../../_components/entry-details";
import { PageHeader } from "../../_components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /entries/[id]: public entry page after the deadline, through public_judge_entries. Members
// come from public_team_members: "First L." unless they opted in to a public profile.
export default async function PublicEntryPage({ params }: PageProps<"/entries/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: entry } = await supabase.from("public_judge_entries").select("*").eq("id", id).maybeSingle();
  if (!entry) notFound();

  const { data: members } = entry.team_id
    ? await supabase.from("public_team_members").select("display_name, full_name, job_title, company").eq("team_id", entry.team_id)
    : { data: [] };
  const roster = (members ?? []).map((m) => ({
    name: m.full_name ?? m.display_name,
    detail: [m.job_title, m.company].filter(Boolean).join(" at ") || null,
  }));

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Link href="/entries" className="font-mono text-xs text-fg-muted no-underline hover:text-fg">
          ← all entries
        </Link>
        <PageHeader eyebrow={entry.team_name} title={entry.title || entry.team_name} />
      </div>
      <EntryDetails entry={{ ...(entry as EntryDetailsData), links: Array.isArray(entry.links) ? entry.links : [] }} roster={roster} />
    </div>
  );
}
