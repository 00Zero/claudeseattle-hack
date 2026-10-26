import type { Metadata } from "next";
import { Suspense } from "react";
import { getProjects } from "@/lib/small-business";
import { getSubmissionDeadline } from "@/app/(judge)/submit/_lib/entry";
import { formatPacific } from "@/lib/time";
import { PageHeader, Sig } from "@/app/(judge)/_components/ui";
import { Finder } from "./finder";
import { ProjectBrowser } from "./project-browser";

export const metadata: Metadata = {
  title: "For small businesses · Claude Impact Lab Hackathon",
  description: "Find the open-source AI tools from the Claude Impact Lab Hackathon that fit your small business.",
};

// /small-businesses: public. A small business describes itself and its challenges and gets the
// hackathon projects that fit (the finder), or browses every project's plain-language summary.
// Data and AI in lib/small-business.ts. Linked from the home page once winners are published and
// from /resources.
export default async function SmallBusinessesPage() {
  const { closesAt, isPast } = await getSubmissionDeadline();

  return (
    <div className="space-y-12">
      <PageHeader eyebrow="Claude Impact Lab · for small businesses" title="Put AI to work in" italic="your business">
        <p>
          At the Claude Impact Lab Hackathon in Seattle, teams of owners, professionals, students, and engineers built AI tools, workflows, and playbooks for small
          businesses. Every project is free and open source on GitHub.
        </p>
        <p>Tell us about your business and we&apos;ll point you to the projects that fit, or browse them all.</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a href="#find" className="btn">
            Find projects for my business
          </a>
          <a href="#projects" className="btn btn-ghost">
            Browse all projects
          </a>
        </div>
      </PageHeader>

      {!isPast ? (
        <p className="text-fg-muted">The projects are published here after submissions close, {formatPacific(closesAt)}.</p>
      ) : (
        <>
          <section id="find" className="scroll-mt-20 space-y-4">
            <Sig call="Ask(your business)" title="Find projects for your business" />
            <Finder />
          </section>

          <section id="projects" className="scroll-mt-20 space-y-4">
            <Sig call="Read(projects.md)" title="Every project" />
            <p className="max-w-[60ch] text-fg-muted">
              Summaries are written by Claude from each team&apos;s submission and README. Open the GitHub repo for setup instructions, or the submission for the demo
              video.
            </p>
            <Suspense fallback={<p className="font-mono text-sm text-fg-muted">Reading the projects…</p>}>
              <Projects />
            </Suspense>
          </section>
        </>
      )}
    </div>
  );
}

// Streams in: the first view after a team edits its entry writes that entry's summary.
async function Projects() {
  const projects = await getProjects();
  return <ProjectBrowser projects={projects} />;
}
