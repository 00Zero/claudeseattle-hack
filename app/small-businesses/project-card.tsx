import Link from "next/link";
import { placeLabel } from "@/lib/event";
import type { Project } from "@/lib/small-business-options";

const FIT = { strong: "Strong fit", good: "Good fit", partial: "Partial fit" };

// One project on /small-businesses, in the browse list and in the finder's matches (with the fit
// and the reason it was picked). loading: the browse list's placeholder while the summary is written.
export function ProjectCard({ project, fit, reason, loading }: { project: Project; fit?: keyof typeof FIT; reason?: string; loading?: boolean }) {
  const plugin = Boolean(project.externalUrl);
  return (
    <article className={`flex h-full flex-col gap-3 rounded-lg border p-4 ${plugin ? "border-accent bg-accent-soft" : "border-line bg-bg-raised"}`}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {project.place && <span className="eyebrow text-accent">{placeLabel(project.place)}</span>}
          {plugin && <span className="eyebrow text-accent">From Anthropic</span>}
          {fit && <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[11px] text-fg">{FIT[fit]}</span>}
        </div>
        <h3 className="font-display text-2xl font-light leading-snug">{project.title}</h3>
        {!plugin && <p className="eyebrow">{project.by}</p>}
      </header>
      {reason && (
        <p className="border-l-2 border-accent pl-3 text-sm text-fg">
          <span className="font-medium">How it could help you:</span> {reason}
        </p>
      )}
      {loading && (
        <div className="space-y-2" role="status">
          <span className="sr-only">Loading the summary</span>
          <div aria-hidden className="h-3 w-full animate-pulse rounded bg-fg/10" />
          <div aria-hidden className="h-3 w-11/12 animate-pulse rounded bg-fg/10" />
          <div aria-hidden className="h-3 w-2/3 animate-pulse rounded bg-fg/10" />
        </div>
      )}
      {!loading && project.summary && <p className="text-sm">{project.summary}</p>}
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
