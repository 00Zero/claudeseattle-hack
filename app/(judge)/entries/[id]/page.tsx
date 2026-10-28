import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { showcaseFolderUrl } from "@/lib/showcase";
import { eventName } from "@/lib/event";
import { indexed, siteName } from "@/lib/site";
import { getProject } from "@/lib/small-business";
import { areaSlug } from "@/lib/small-business-options";
import { JsonLd, projectLd } from "@/components/site/json-ld";
import { EntryDetails, type EntryDetailsData } from "../../_components/entry-details";
import { PageHeader, Sig } from "../../_components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// /entries/[id]: public entry page after the deadline, through public_judge_entries. Members
// come from public_team_members: "First L." unless they opted in to a public profile.
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
      <Suspense fallback={null}>
        <ForBusinesses id={entry.id} />
      </Suspense>
      <EntryDetails
        entry={{ ...(entry as EntryDetailsData), links: Array.isArray(entry.links) ? entry.links : [] }}
        roster={roster}
        snapshotHref={showcaseFolderUrl(entry.id)}
      />
    </div>
  );
}

// The plain-language summary from /small-businesses (what it does, who it's for, setup, areas),
// streamed in: it's cached, but written by Claude the first time it's needed. Also the page's
// structured data for search engines.
async function ForBusinesses({ id }: { id: string }) {
  const project = await getProject(id);
  if (!project) return null;
  return (
    <section className="space-y-3">
      <JsonLd data={projectLd(project)} />
      {project.forWhom && (
        <>
          <Sig call="Read(summary.md)" title="For small businesses" />
          <p className="max-w-[65ch]">{project.summary}</p>
          <p className="max-w-[65ch] text-fg-muted">
            <span className="font-medium text-fg">Best for:</span> {project.forWhom}
          </p>
          <ul className="flex flex-wrap gap-1.5 font-mono text-xs">
            {project.setup && <li className="rounded border border-line-strong px-1.5 py-0.5">Setup: {project.setup.toLowerCase()}</li>}
            {project.areas.map((area) => (
              <li key={area}>
                <Link href={`/small-businesses/${areaSlug(area)}`} className="block rounded border border-line px-1.5 py-0.5 text-fg-muted no-underline hover:text-fg">
                  {area}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-fg-muted">
            Summary by Claude from the team&apos;s submission and README. <Link href="/small-businesses" className="underline">
              Find more free AI tools for your business →
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
