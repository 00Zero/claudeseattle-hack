"use client";

import { useState } from "react";
import { AREAS, CLAUDE_PLUGIN, type Project } from "@/lib/small-business-options";
import { ProjectCard } from "./project-card";

// Every project with a filter by the part of the business it helps with. Claude for Small
// Business is always first.
export function ProjectBrowser({ projects }: { projects: Project[] }) {
  const [area, setArea] = useState<string | null>(null);
  const used = AREAS.filter((a) => projects.some((p) => p.areas.includes(a)));
  const shown = [CLAUDE_PLUGIN, ...projects].filter((p) => !area || p.areas.includes(area));

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 font-mono text-xs ${active ? "border-accent bg-accent text-accent-fg" : "border-line-strong text-fg-muted hover:bg-fg/5 hover:text-fg"}`;

  return (
    <div className="space-y-4">
      {used.length > 0 && (
        <div role="group" aria-label="Filter by part of the business" className="flex flex-wrap gap-2">
          <button type="button" className={chip(area === null)} aria-pressed={area === null} onClick={() => setArea(null)}>
            All ({projects.length + 1})
          </button>
          {used.map((a) => (
            <button key={a} type="button" className={chip(area === a)} aria-pressed={area === a} onClick={() => setArea(area === a ? null : a)}>
              {a}
            </button>
          ))}
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id}>
            <ProjectCard project={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}
