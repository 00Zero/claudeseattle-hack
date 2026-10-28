import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

// The public pages for search engines: home, /small-businesses, /results, and each entry
// (public_judge_entries is empty until submissions close).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const { data } = await supabase.from("public_judge_entries").select("id").order("team_name");
  return [
    { url: siteUrl },
    { url: `${siteUrl}/small-businesses` },
    { url: `${siteUrl}/results` },
    ...((data ?? []) as { id: string }[]).map((entry) => ({ url: `${siteUrl}/entries/${entry.id}` })),
  ];
}
