import { CLAUDE_PLUGIN, type Project } from "@/lib/small-business-options";
import { eventName } from "@/lib/event";
import { siteName, siteUrl } from "@/lib/site";

// Structured data (schema.org JSON-LD) for search engines and AI answers. `<` is escaped so a value
// typed by a team can't close the script tag.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c") }} />;
}

export const organizer = { "@type": "Organization", name: siteName, url: siteUrl };

// A hackathon project, or Anthropic's plugin, as a free piece of software for small businesses.
export function projectLd(project: Project) {
  const url = project.entryPath ? `${siteUrl}${project.entryPath}` : project.externalUrl;
  if (project.id === CLAUDE_PLUGIN.id) {
    return { "@type": "SoftwareApplication", name: project.title, description: project.summary, url, applicationCategory: "BusinessApplication", author: { "@type": "Organization", name: "Anthropic" } };
  }
  return {
    "@type": "SoftwareSourceCode",
    name: project.title,
    description: project.summary,
    url,
    ...(project.repoUrl && { codeRepository: project.repoUrl }),
    author: { "@type": "Organization", name: project.by },
    isAccessibleForFree: true,
    audience: { "@type": "BusinessAudience", audienceType: project.forWhom ?? "Small businesses" },
    ...(project.areas.length > 0 && { keywords: project.areas.join(", ") }),
    isPartOf: { "@type": "Event", name: eventName, url: siteUrl },
  };
}

export function projectListLd(projects: Project[], name: string) {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: projects.length,
    itemListElement: projects.map((project, i) => ({ "@type": "ListItem", position: i + 1, item: projectLd(project) })),
  };
}
