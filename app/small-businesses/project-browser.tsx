"use client";

import { Suspense, use, useState } from "react";
import { AREAS, CLAUDE_PLUGIN, type Project } from "@/lib/small-business-options";
import { ProjectCard } from "./project-card";

type Streamed = { base: Project; full: Promise<Project> };

// Every project with a filter by the part of the business it helps with. Claude for Small
// Business is always first. Each card shows at once and fills in when its summary arrives
// (lib/small-business.ts, getProjectStream); the filter needs every summary's tags, so it
// appears once they're all in.
export function ProjectBrowser({ projects, all }: { projects: Streamed[]; all: Promise<Project[]> }) {
  const [area, setArea] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <Filters all={all} count={projects.length + 1} area={area} setArea={setArea} />
      </Suspense>
      <ul className="grid gap-3 sm:grid-cols-2">
        {(!area || CLAUDE_PLUGIN.areas.includes(area)) && (
          <li>
            <ProjectCard project={CLAUDE_PLUGIN} />
          </li>
        )}
        {projects.map((p) => (
          <Suspense
            key={p.base.id}
            fallback={
              <li>
                <ProjectCard project={p.base} loading />
              </li>
            }
          >
            <StreamedCard full={p.full} area={area} />
          </Suspense>
        ))}
      </ul>
    </div>
  );
}

function StreamedCard({ full, area }: { full: Promise<Project>; area: string | null }) {
  const project = use(full);
  if (area && !project.areas.includes(area)) return null;
  return (
    <li>
      <ProjectCard project={project} />
    </li>
  );
}

function Filters({ all, count, area, setArea }: { all: Promise<Project[]>; count: number; area: string | null; setArea: (a: string | null) => void }) {
  const projects = use(all);
  const used = AREAS.filter((a) => projects.some((p) => p.areas.includes(a)));
  if (used.length === 0) return null;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 font-mono text-xs ${active ? "border-accent bg-accent text-accent-fg" : "border-line-strong text-fg-muted hover:bg-fg/5 hover:text-fg"}`;

  return (
    <div role="group" aria-label="Filter by part of the business" className="flex flex-wrap gap-2">
      <button type="button" className={chip(area === null)} aria-pressed={area === null} onClick={() => setArea(null)}>
        All ({count})
      </button>
      {used.map((a) => (
        <button key={a} type="button" className={chip(area === a)} aria-pressed={area === a} onClick={() => setArea(area === a ? null : a)}>
          {a}
        </button>
      ))}
    </div>
  );
}
