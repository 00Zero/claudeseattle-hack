import Link from "next/link";
import type { Project } from "@/lib/small-business-options";

const PLACES = ["1st place", "2nd place", "3rd place"];

const FIT = { strong: "Strong fit", good: "Good fit", partial: "Partial fit" };

// One project on /small-businesses, in the browse list and in the finder's matches (with the fit
// and the reason it was picked).
export function ProjectCard({ project, fit, reason }: { project: Project; fit?: keyof typeof FIT; reason?: string }) {
  const plugin = Boolean(project.externalUrl);
  return (
    <article className={`flex h-full flex-col gap-3 rounded-lg border p-4 ${plugin ? "border-accent bg-accent-soft" : "border-line bg-bg-raised"}`}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {project.place && project.place <= 3 && <span className="eyebrow text-accent">{PLACES[project.place - 1]}</span>}
          {plugin && <span className="eyebrow text-accent">From Anthropic</span>}
          {fit && <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[11px] text-fg">{FIT[fit]}</span>}
        </div>
        <h3 className="font-display text-2xl font-light leading-snug">{project.title}</h3>
        {!plugin && <p className="eyebrow">{project.by}</p>}
      </header>
      {reason && <p className="border-l-2 border-accent pl-3 text-sm text-fg">{reason}</p>}
      {project.summary && <p className="text-sm">{project.summary}</p>}
      {project.forWhom && (
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">Best for:</span> {project.forWhom}
        </p>
      )}
      {(project.setup || project.areas.length > 0) && (
        <ul className="flex flex-wrap gap-1.5 font-mono text-[11px] text-fg-muted">
          {project.setup && <li className="rounded border border-line-strong px-1.5 py-0.5 text-fg">Setup: {project.setup.toLowerCase()}</li>}
          {project.areas.map((area) => (
            <li key={area} className="rounded border border-line px-1.5 py-0.5">
              {area}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
        {project.externalUrl && (
          <a href={project.externalUrl} target="_blank" rel="noopener noreferrer">
            Learn more and install ↗
          </a>
        )}
        {project.repoUrl && (
          <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">
            GitHub repo ↗
          </a>
        )}
        {project.entryPath && <Link href={project.entryPath}>Submission and demo →</Link>}
      </div>
    </article>
  );
}
