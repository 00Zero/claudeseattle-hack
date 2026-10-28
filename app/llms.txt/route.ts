import { getProjects } from "@/lib/small-business";
import { AREAS, areaSlug, CLAUDE_PLUGIN, type Project } from "@/lib/small-business-options";
import { eventDate, eventName, placeLabel } from "@/lib/event";
import { siteUrl } from "@/lib/site";

// /llms.txt: the public pages and every tool as plain Markdown, for AI assistants and crawlers
// (llmstxt.org). Same data as /small-businesses; summaries are cached, so this is cheap after the
// first read. Empty tool list until submissions close.
export async function GET() {
  const projects = await getProjects();
  const lines = [
    `# ${eventName}: free AI tools for small businesses`,
    "",
    `> Free, open-source AI tools, workflows, and playbooks for small businesses, built with Claude by teams of owners, professionals, students, and engineers at a one-day hackathon in Seattle on ${eventDate}, run by Claude Community Seattle.`,
    "",
    'Every tool\'s code is on GitHub. Each one below says what it does, which businesses it suits, and how much setup it takes for an owner without a technical background ("No code", "Some technical help", or "Needs a developer").',
    "",
    "## Pages",
    "",
    `- [Find tools for your business](${siteUrl}/small-businesses): describe your business and Claude suggests the tools that fit, or browse them all`,
    `- [Winners and every project](${siteUrl}/results)`,
    ...AREAS.map((area) => `- [Tools for ${area.charAt(0).toLowerCase()}${area.slice(1)}](${siteUrl}/small-businesses/${areaSlug(area)})`),
    "",
    "## Tools",
    "",
    ...[CLAUDE_PLUGIN, ...projects].map(toolLine),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}

function toolLine(project: Project) {
  const url = project.entryPath ? `${siteUrl}${project.entryPath}` : project.externalUrl;
  const by = project.place ? `${project.by}, ${placeLabel(project.place)}` : project.by;
  return [
    `- [${project.title}](${url}) (${by}): ${project.summary}`,
    project.forWhom && `Best for: ${project.forWhom}`,
    project.setup && `Setup: ${project.setup}.`,
    project.areas.length > 0 && `Areas: ${project.areas.join(", ")}.`,
    project.repoUrl && `Code: ${project.repoUrl}`,
  ]
    .filter(Boolean)
    .join(" ");
}
