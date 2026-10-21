// Loads LinkedIn enrichment into linkedin_enrichment, one row per profile per source
// (20261021073547_shared_enrichment_sources.sql). Accepts, in any mix:
// - Apify JSON exports from harvestapi/linkedin-profile-scraper (an array of profiles)
// - EnrichLayer exports shaped for this table ({ rows: [{ linkedin_slug, source, ... }] })
//
//   npx tsx --env-file=.env.local scripts/import-linkedin-enrichment.ts [--dry-run] [--out=rows.json] <file.json>...
//
// --dry-run prints the counts and writes nothing; --out= also writes the normalized rows to a
// file (outside the repo) for inspection instead of the database.
//
// Normalizing and trimming live in lib/enrichment.ts, shared with the admin upload at
// /admin/enrichment. Prints counts only.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Export files never go in git.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { linkedinSlug, newestRows, parseEnrichmentFile, type EnrichmentRow } from "../lib/enrichment";

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const dryRun = args.includes("--dry-run") || !!out;
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) throw new Error("Usage: import-linkedin-enrichment.ts [--dry-run] <file.json>...");

  const collected: EnrichmentRow[] = [];
  let skipped = 0;
  for (const file of files) {
    const parsed = parseEnrichmentFile(JSON.parse(readFileSync(file, "utf8")), statSync(file).mtime.toISOString());
    if (!parsed) throw new Error(`${file}: not an Apify export or an EnrichLayer export`);
    collected.push(...parsed.rows);
    skipped += parsed.skipped;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: guests, error: guestsError } = await supabase.from("luma_guests").select("linkedin_url");
  if (guestsError) throw new Error(guestsError.message);
  const guestSlugs = new Set(guests.map((g) => linkedinSlug(g.linkedin_url)).filter(Boolean));

  const all = newestRows(collected);
  const count = (source: EnrichmentRow["source"]) => all.filter((r) => r.source === source);
  for (const source of ["apify", "enrichlayer"] as const) {
    const these = count(source);
    console.log(
      `${source}: ${these.length} profiles, ${these.filter((r) => guestSlugs.has(r.linkedin_slug)).length} match a Luma guest, ` +
        `${these.filter((r) => r.skills.length > 0).length} with skills, ${these.filter((r) => r.summary).length} with a summary`,
    );
  }
  if (skipped) console.log(`Skipped ${skipped} records with no LinkedIn profile URL`);
  if (out) writeFileSync(out, JSON.stringify(all));
  if (dryRun) return console.log(out ? `Wrote normalized rows to ${out}; database untouched.` : "Dry run: nothing written.");

  for (let i = 0; i < all.length; i += 100) {
    const { error } = await supabase
      .from("linkedin_enrichment")
      .upsert(all.slice(i, i + 100), { onConflict: "linkedin_slug,source" });
    if (error) throw new Error(`Stopped after ${i} rows: ${error.message}`);
  }
  console.log(`Upserted ${all.length} rows.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
