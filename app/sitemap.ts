import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { AREAS, areaSlug } from "@/lib/small-business-options";

// The public pages for search engines: home, /small-businesses and its area pages, /results, /gallery, and each entry
// (public_judge_entries is empty until submissions close).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const { data } = await supabase.from("public_judge_entries").select("id").order("team_name");
  return [
    { url: siteUrl },
    { url: `${siteUrl}/small-businesses` },
    ...AREAS.map((area) => ({ url: `${siteUrl}/small-businesses/${areaSlug(area)}` })),
    { url: `${siteUrl}/results` },
    { url: `${siteUrl}/gallery` },
    ...((data ?? []) as { id: string }[]).map((entry) => ({ url: `${siteUrl}/entries/${entry.id}` })),
  ];
}
