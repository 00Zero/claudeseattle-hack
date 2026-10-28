import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getProjects } from "@/lib/small-business";
import { AREAS, areaFromSlug, areaSlug, CLAUDE_PLUGIN } from "@/lib/small-business-options";
import { getSubmissionDeadline } from "@/app/(judge)/submit/_lib/entry";
import { eventName } from "@/lib/event";
import { indexed } from "@/lib/site";
import { formatPacific } from "@/lib/time";
import { PageHeader, Sig } from "@/app/(judge)/_components/ui";
import { JsonLd, projectListLd } from "@/components/site/json-ld";
import { ProjectCard } from "../project-card";

// "Finance & bookkeeping" -> "finance & bookkeeping" mid-sentence; "Hiring & HR" keeps its HR.
const inSentence = (area: string) => area.charAt(0).toLowerCase() + area.slice(1);

export async function generateMetadata({ params }: PageProps<"/small-businesses/[area]">): Promise<Metadata> {
  const area = areaFromSlug((await params).area);
  if (!area) return {};
  return {
    title: `Free AI tools for small-business ${inSentence(area)}`,
    description: `Free, open-source AI tools for small-business ${inSentence(area)}, built with Claude at the ${eventName} in Seattle: what each one does, who it's for, and how much setup it takes.`,
    robots: indexed,
    alternates: { canonical: `/small-businesses/${areaSlug(area)}` },
  };
}

// /small-businesses/<area>: public. The tools for one part of a business (AREAS in
// lib/small-business-options.ts, tagged in each summary), one page per area so owners searching
// for, say, bookkeeping tools land on them.
export default async function AreaPage({ params }: PageProps<"/small-businesses/[area]">) {
  const area = areaFromSlug((await params).area);
  if (!area) notFound();
  const { closesAt, isPast } = await getSubmissionDeadline();

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Link href="/small-businesses" className="font-mono text-xs text-fg-muted no-underline hover:text-fg">
          ← all tools
        </Link>
        <PageHeader eyebrow="Claude Impact Lab · for small businesses" title="Free AI tools for" italic={inSentence(area)}>
          <p>
            Built with Claude by teams of owners, professionals, students, and engineers at a one-day hackathon in Seattle. Every tool is free and open source on
            GitHub, and each says who it&apos;s for and how much setup it takes.
          </p>
        </PageHeader>
      </div>

      {!isPast ? (
        <p className="text-fg-muted">The tools are published here after submissions close, {formatPacific(closesAt)}.</p>
      ) : (
        <section className="space-y-4">
          <Sig call={`Grep(${areaSlug(area)})`} title={area} />
          <Suspense fallback={<p className="font-mono text-sm text-fg-muted">Reading the tools…</p>}>
            <AreaTools area={area} />
          </Suspense>
        </section>
      )}

      <section className="space-y-3">
        <p>
          <Link href="/small-businesses#find" className="underline">Describe your business and find the tools that fit →</Link>
        </p>
        <p className="max-w-[65ch] text-fg-muted">
          Other areas:{" "}
          {AREAS.filter((other) => other !== area).map((other, i) => (
            <span key={other}>
              {i > 0 && " · "}
              <Link href={`/small-businesses/${areaSlug(other)}`} className="underline">
                {other}
              </Link>
            </span>
          ))}
        </p>
      </section>
    </div>
  );
}

// Waits for every summary: the area tags come from them.
async function AreaTools({ area }: { area: string }) {
  const projects = [CLAUDE_PLUGIN, ...(await getProjects())].filter((project) => project.areas.includes(area));
  if (projects.length === 0) return <p className="text-fg-muted">No tools for this area yet.</p>;
  return (
    <>
      <JsonLd data={projectListLd(projects, `Free AI tools for small-business ${inSentence(area)}`)} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {projects.map((project) => (
          <li key={project.id}>
            <ProjectCard project={project} />
          </li>
        ))}
      </ul>
    </>
  );
}
