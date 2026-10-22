import { redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import { RESOURCE_SECTIONS, type Resource } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

// Links for approved attendees: credits, the name tag form, the small business data folder.
// RLS (resources_read) returns only visible rows, and only to people with full access.
// Admins edit the list in /admin/settings.
export default async function ResourcesPage() {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  if (access === "blocked") redirect("/declined");

  if (access !== "full") {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Resources</h1>
        <p>Credits, the name tag form, and the small business data are available here once your registration is approved.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("resources")
    .select("id, section, title, description, url, sort_order, visible")
    .order("sort_order")
    .order("title");
  const resources = (data ?? []) as Resource[];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Resources</h1>
        <p className="text-fg-muted">For attendees of the Claude Impact Lab Hackathon. Please don&apos;t share these links outside the event.</p>
      </div>
      {resources.length === 0 && <p className="text-fg-muted">Nothing here yet. Check back closer to the event.</p>}
      {RESOURCE_SECTIONS.map((section) => {
        const items = resources.filter((r) => r.section === section.key);
        if (items.length === 0) return null;
        return (
          <section key={section.key} className="space-y-3">
            <h2 className="text-lg font-semibold">{section.label}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((r) => (
                <li key={r.id}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full rounded border border-line p-4 no-underline hover:border-line-strong hover:bg-fg/5"
                  >
                    <span className="font-medium text-fg">{r.title} ↗</span>
                    {r.description && <span className="mt-1 block text-sm text-fg-muted">{r.description}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
