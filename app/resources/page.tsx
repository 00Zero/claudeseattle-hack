import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import type { AttendeeOffer } from "@/lib/offers";
import { isDriveFolder, RESOURCE_SECTIONS, type Resource } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";
import { DriveFolderCard } from "./drive-folder-card";
import { OfferCard } from "./offer-card";
import { UploadForm } from "./upload-form";

// Links for approved attendees: credits, the name tag form, the small business data folder.
// A Google Drive folder gets its own card with buttons to open it and add Claude's Drive connector.
// RLS (resources_read) returns only visible rows, and only to people with full access.
// Admins edit the list in /admin/settings.
// Sponsor offers (lib/offers.ts) lead the Credits section; attendee_offers() leaves out their links
// until the person has checked in, where an admin requires it. Admins manage them in /admin/offers.
// At the bottom, approved attendees upload photos and videos to a restricted Google Drive folder
// (lib/media.ts); they never see the folder. "Your uploads" lists only the viewer's own (RLS).
export default async function ResourcesPage() {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  if (access === "blocked") redirect("/declined");

  if (access !== "full") {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Resources</h1>
        <p>Credits, the name tag form, the small business data, and photo and video uploads are available here once your registration is approved.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data }, { data: offerRows }] = await Promise.all([
    supabase
      .from("resources")
      .select("id, section, title, description, url, sort_order, visible")
      .order("sort_order")
      .order("title"),
    supabase.rpc("attendee_offers"),
  ]);
  const resources = (data ?? []) as Resource[];
  const offers = (offerRows ?? []) as AttendeeOffer[];
  const { data: uploads } = await supabase
    .from("media_uploads")
    .select("id, file_name, size_bytes")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Resources</h1>
        <p className="text-fg-muted">For attendees of the Claude Impact Lab Hackathon. Please don&apos;t share these links outside the event.</p>
      </div>
      {resources.length === 0 && offers.length === 0 && <p className="text-fg-muted">Nothing here yet. Check back closer to the event.</p>}
      {RESOURCE_SECTIONS.map((section) => {
        const items = resources.filter((r) => r.section === section.key);
        const sectionOffers = section.key === "credits" ? offers : [];
        if (items.length === 0 && sectionOffers.length === 0) return null;
        return (
          <section key={section.key} className="space-y-3">
            <h2 className="text-lg font-semibold">{section.label}</h2>
            {sectionOffers.length > 0 && (
              <ul className="grid gap-4 lg:grid-cols-2">
                {sectionOffers.map((o) => (
                  <li key={o.slug}>
                    <OfferCard offer={o} />
                  </li>
                ))}
              </ul>
            )}
            {items.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {items.map((r) =>
                  isDriveFolder(r.url) ? (
                    <li key={r.id} className="sm:col-span-2">
                      <DriveFolderCard resource={r} />
                    </li>
                  ) : (
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
                  ),
                )}
              </ul>
            )}
          </section>
        );
      })}
      <section id="upload-media" className="scroll-mt-20 space-y-3 border-t border-line pt-8">
        <h2 className="text-lg font-semibold">Upload photos and videos</h2>
        <p className="text-fg-muted">Share your photos and videos from the event. They go to the organizers; other attendees can&apos;t see them.</p>
        <p className="rounded border border-line bg-bg-raised px-3 py-2 text-sm text-fg-muted">
          By registering for this website or the event, or attending it, you agree that the hosts and their affiliates may use your
          name, image, and likeness, and the photos and videos you upload, to publicize the event.{" "}
          <Link href="/terms#media">Read the full terms</Link>.
        </p>
        <UploadForm />
        {uploads && uploads.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Your uploads ({uploads.length})</h3>
            <ul className="divide-y divide-line rounded border border-line text-sm">
              {uploads.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">{u.file_name}</span>
                  <span className="shrink-0 text-fg-muted">{(u.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
