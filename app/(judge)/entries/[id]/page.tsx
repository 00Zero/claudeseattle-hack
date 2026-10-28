import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { showcaseFolderUrl } from "@/lib/showcase";
import { eventName } from "@/lib/event";
import { indexed, siteName } from "@/lib/site";
import { EntryDetails, type EntryDetailsData } from "../../_components/entry-details";
import { PageHeader } from "../../_components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /entries/[id]: public entry page after the deadline, through public_judge_entries. Members
// come from public_team_members: "First L." unless they opted in to a public profile.
// One read per request, shared by the page and its metadata.
const getEntry = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("public_judge_entries").select("*").eq("id", id).maybeSingle();
  return data;
});

// Search and link previews: the project's name and tagline, and the team's own description (the
// short one, else the start of the long one).
export async function generateMetadata({ params }: PageProps<"/entries/[id]">): Promise<Metadata> {
  const { id } = await params;
  const entry = await getEntry(id);
  if (!entry) return {};
  const name = entry.title || entry.team_name;
  const title = entry.tagline && entry.tagline !== name ? `${name}: ${entry.tagline}` : name;
  const description =
    entry.description_short?.trim() ||
    clip(entry.description_long?.trim() ?? "", 200) ||
    `${name}: a free, open-source AI tool for small businesses from the ${eventName} in Seattle.`;
  return {
    title,
    description,
    robots: indexed,
    alternates: { canonical: `/entries/${id}` },
    openGraph: { type: "website", siteName, title, description },
  };
}

function clip(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(" ", max)).replace(/[\s,;:.]+$/, "")}…`;
}

export default async function PublicEntryPage({ params }: PageProps<"/entries/[id]">) {
  const { id } = await params;
  const entry = await getEntry(id);
  if (!entry) notFound();

  const supabase = await createClient();

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
      <EntryDetails
        entry={{ ...(entry as EntryDetailsData), links: Array.isArray(entry.links) ? entry.links : [] }}
        roster={roster}
        snapshotHref={showcaseFolderUrl(entry.id)}
      />
    </div>
  );
}
