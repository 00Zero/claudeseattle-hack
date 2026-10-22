import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin";
import { apifyInput, linkedinSlug } from "@/lib/enrichment";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEST_GUEST_PREFIX } from "@/lib/test-accounts";
import { CopyBox, UploadForm } from "./upload-form";

// LinkedIn enrichment for Luma guests: who has it, the URLs to send to Apify for who doesn't,
// and the upload for the exports. Super admins only for now.

const STATUSES = ["approved", "pending_approval", "waitlist", "declined"] as const;
const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  pending_approval: "Pending",
  waitlist: "Waitlist",
  declined: "Declined",
};
const SHOW = { missing: "Not in Apify", enriched: "In Apify", all: "All" } as const;
type Show = keyof typeof SHOW;
type State = "apify" | "enrichlayer" | "none" | "no_url";

type Guest = {
  guest_id: string;
  name: string | null;
  approval_status: string;
  ticket_name: string | null;
  linkedin_url: string | null;
};

const pacificDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

// "linkedin.com/in/Jane-Doe/?x" -> "https://www.linkedin.com/in/jane-doe": what Apify gets, and
// what the import keys the result by.
function profileUrl(url: string | null) {
  const match = url?.match(/linkedin\.com\/(in|pub)\/([^/?#\s]+)/i);
  return match ? `https://www.linkedin.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}` : null;
}

export default async function EnrichmentPage({ searchParams }: PageProps<"/admin/enrichment">) {
  const me = await requireAdminPage();
  if (!me.is_super_admin) notFound();

  const params = await searchParams;
  const show: Show = typeof params.show === "string" && params.show in SHOW ? (params.show as Show) : "missing";
  const status = typeof params.status === "string" && (STATUSES as readonly string[]).includes(params.status) ? params.status : "all";

  const admin = createAdminClient();
  const [{ data: guests }, { data: enrichment }] = await Promise.all([
    admin
      .from("luma_guests")
      .select("guest_id, name, approval_status, ticket_name, linkedin_url")
      .not("guest_id", "like", `${TEST_GUEST_PREFIX}%`) // test-account copies (lib/test-accounts.ts)
      .order("name"),
    admin.from("linkedin_enrichment").select("linkedin_slug, source, fetched_at"),
  ]);

  const fetched = new Map<string, { apify?: string; enrichlayer?: string }>();
  for (const row of enrichment ?? []) {
    const entry = fetched.get(row.linkedin_slug) ?? {};
    entry[row.source as "apify" | "enrichlayer"] = row.fetched_at;
    fetched.set(row.linkedin_slug, entry);
  }

  const people = ((guests ?? []) as Guest[]).map((g) => {
    const slug = linkedinSlug(g.linkedin_url);
    const sources = slug ? fetched.get(slug) : undefined;
    const state: State = !slug ? "no_url" : sources?.apify ? "apify" : sources?.enrichlayer ? "enrichlayer" : "none";
    return { ...g, slug, sources, state };
  });

  const coverage = [...STATUSES, "all" as const].map((s) => {
    const group = s === "all" ? people : people.filter((p) => p.approval_status === s);
    const count = (state: State) => group.filter((p) => p.state === state).length;
    return { status: s, guests: group.length, apify: count("apify"), enrichlayer: count("enrichlayer"), none: count("none"), noUrl: count("no_url") };
  });

  const listed = people.filter(
    (p) =>
      (status === "all" || p.approval_status === status) &&
      (show === "all" || (show === "enriched" ? p.state === "apify" : p.state !== "apify")),
  );
  // URLs to send to Apify: listed guests without Apify data, one per profile.
  const toEnrich = [...new Set(listed.filter((p) => p.state === "none" || p.state === "enrichlayer").map((p) => profileUrl(p.linkedin_url)))].filter(
    (u): u is string => !!u,
  );

  const filterLink = (next: { show?: Show; status?: string }) => {
    const q = new URLSearchParams({ show: next.show ?? show, status: next.status ?? status });
    return `/admin/enrichment?${q}`;
  };
  const chip = (active: boolean) =>
    `rounded border px-2 py-0.5 text-xs ${active ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:bg-foreground/5"}`;

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">LinkedIn enrichment</h1>
        <p className="text-sm text-foreground/70">
          Apify is the main source; EnrichLayer fills fields Apify lacks. Matching reads the merged result. Super admins only.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-foreground/60">
              <tr>
                <th className="py-1 pr-3 font-medium">Luma status</th>
                <th className="py-1 pr-3 font-medium">Guests</th>
                <th className="py-1 pr-3 font-medium">In Apify</th>
                <th className="py-1 pr-3 font-medium">EnrichLayer only</th>
                <th className="py-1 pr-3 font-medium">Not enriched</th>
                <th className="py-1 font-medium">No LinkedIn URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {coverage.map((c) => (
                <tr key={c.status} className={c.status === "all" ? "font-semibold" : ""}>
                  <td className="py-1 pr-3">{c.status === "all" ? "All" : STATUS_LABEL[c.status]}</td>
                  <td className="py-1 pr-3">{c.guests}</td>
                  <td className="py-1 pr-3">{c.apify}</td>
                  <td className="py-1 pr-3">{c.enrichlayer}</td>
                  <td className="py-1 pr-3">{c.none}</td>
                  <td className="py-1">{c.noUrl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upload exports</h2>
        <p className="text-sm text-foreground/70">
          Apify JSON exports (harvestapi/linkedin-profile-scraper) or EnrichLayer exports, several at once. Files are read and
          trimmed in your browser; only the cleaned rows are sent. Re-uploading a profile replaces that source&apos;s row.
        </p>
        <UploadForm guestSlugs={people.flatMap((p) => (p.slug ? [p.slug] : []))} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Guests</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(SHOW) as Show[]).map((s) => (
            <Link key={s} href={filterLink({ show: s })} className={chip(show === s)}>
              {SHOW[s]}
            </Link>
          ))}
          <span className="px-1 text-foreground/30">|</span>
          {["all", ...STATUSES].map((s) => (
            <Link key={s} href={filterLink({ status: s })} className={chip(status === s)}>
              {s === "all" ? "Any status" : STATUS_LABEL[s]}
            </Link>
          ))}
        </div>

        {toEnrich.length > 0 ? (
          <div className="grid gap-3 rounded border border-foreground/20 p-3 md:grid-cols-2">
            <CopyBox label={`${toEnrich.length} LinkedIn URLs for Apify (one per line)`} text={toEnrich.join("\n")} />
            <CopyBox label="Apify input JSON (no email lookup)" text={apifyInput(toEnrich)} />
            <p className="text-xs text-foreground/60 md:col-span-2">
              From the guests listed below that have no Apify data. Paste the JSON in the actor&apos;s JSON input, or the URLs into
              its Queries field (Bulk edit), run it, export the dataset as JSON, and upload it above.
            </p>
          </div>
        ) : (
          <p className="text-sm text-foreground/60">Everyone listed below with a LinkedIn URL already has Apify data.</p>
        )}

        <p className="text-sm text-foreground/60">{listed.length} guests</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-foreground/60">
              <tr>
                <th className="py-1 pr-3 font-medium">Name</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 pr-3 font-medium">Ticket</th>
                <th className="py-1 pr-3 font-medium">LinkedIn</th>
                <th className="py-1 font-medium">Enrichment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {listed.map((p) => (
                <tr key={p.guest_id}>
                  <td className="py-1 pr-3">{p.name || "(no name)"}</td>
                  <td className="py-1 pr-3">{STATUS_LABEL[p.approval_status] ?? p.approval_status}</td>
                  <td className="py-1 pr-3">{p.ticket_name || "—"}</td>
                  <td className="py-1 pr-3">
                    {p.slug ? (
                      <a href={profileUrl(p.linkedin_url)!} target="_blank" rel="noopener noreferrer" className="underline">
                        {p.slug}
                      </a>
                    ) : (
                      <span className="text-foreground/50">none</span>
                    )}
                  </td>
                  <td className="py-1">
                    {p.state === "no_url" || p.state === "none" ? (
                      <span className="text-foreground/50">—</span>
                    ) : (
                      [
                        p.sources?.apify && `Apify ${pacificDate(p.sources.apify)}`,
                        p.sources?.enrichlayer && `EnrichLayer ${pacificDate(p.sources.enrichlayer)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
