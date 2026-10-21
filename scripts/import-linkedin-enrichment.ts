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
// Every source is normalized to the same columns: dates as YYYY-MM, at most 10 roles (current
// first) with descriptions cut to 500 characters, skills as names. raw keeps an allowlist of
// the person's own profile; other people (suggested profiles, recommendations), followed
// accounts, photos, emails and open-to-work status are never stored. Prints counts only.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Export files never go in git.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, statSync, writeFileSync } from "node:fs";

type Json = Record<string, unknown>;
type Role = { title: string | null; company: string | null; starts_at: string | null; ends_at: string | null; description: string | null };
type School = { school: string | null; degree: string | null; field: string | null };
type Row = {
  linkedin_slug: string;
  source: "apify" | "enrichlayer";
  fetched_at: string;
  headline: string | null;
  summary: string | null;
  current_title: string | null;
  current_company: string | null;
  skills: string[];
  experiences: Role[];
  education: School[];
  raw: Json;
};

const MAX_ROLES = 10;
const MAX_DESCRIPTION = 500;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const APIFY_RAW_KEYS = [
  "id", "publicIdentifier", "linkedinUrl", "originalQuery", "headline", "about", "industry",
  "currentPosition", "experience", "education", "certifications", "projects", "volunteering",
  "skills", "publications", "courses", "patents", "honorsAndAwards", "languages", "organizations",
];
const ENRICHLAYER_RAW_KEYS = ["slug", "headline", "summary", "occupation", "industry", "experiences", "education", "skills", "fetchedAt"];

// Same as linkedin_slug() in SQL: "https://www.linkedin.com/in/Jane-Doe/?x=1" -> "jane-doe".
function linkedinSlug(url: unknown) {
  const match = String(url ?? "").match(/linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function text(value: unknown) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

// Keep only the listed keys, and drop logos, pictures and photos at any depth.
function pick(source: Json, keys: string[]): Json {
  const strip = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(strip)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Json)
              .filter(([k]) => !/logo|picture|photo|image/i.test(k))
              .map(([k, v]) => [k, strip(v)]),
          )
        : value;
  return Object.fromEntries(keys.filter((k) => source[k] != null).map((k) => [k, strip(source[k])]));
}

// Apify: { month: "Nov", year: 2024 } / { year: 2024 } / { text: "Present" }. EnrichLayer: "2024-05-01".
function month(value: unknown): string | null {
  if (typeof value === "string") return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : null;
  if (!value || typeof value !== "object") return null;
  const { year, month: m } = value as { year?: number; month?: string };
  if (!year) return null;
  const index = m ? MONTHS.indexOf(m.slice(0, 3).toLowerCase()) : -1;
  return index >= 0 ? `${year}-${String(index + 1).padStart(2, "0")}` : String(year);
}

// Current roles first, then newest start date.
function topRoles(roles: Role[]) {
  return roles
    .map((role, i) => ({ role, i }))
    .sort((a, b) =>
      Number(a.role.ends_at !== null) - Number(b.role.ends_at !== null) ||
      (b.role.starts_at ?? "").localeCompare(a.role.starts_at ?? "") ||
      a.i - b.i,
    )
    .slice(0, MAX_ROLES)
    .map(({ role }) => ({ ...role, description: role.description?.slice(0, MAX_DESCRIPTION) ?? null }));
}

function fromApify(profile: Json, fetchedAt: string): Row | null {
  const query = (profile.originalQuery as Json | undefined)?.query;
  // Key by the URL we asked for (what Luma and profiles hold), not the one LinkedIn redirected to.
  const slug = linkedinSlug(query) ?? linkedinSlug(profile.linkedinUrl);
  if (!slug) return null;

  const roles = ((profile.experience as Json[]) ?? []).map((e) => ({
    title: text(e.position),
    company: text(e.companyName),
    starts_at: month(e.startDate),
    ends_at: (e.endDate as Json | undefined)?.text === "Present" || !e.endDate ? null : month(e.endDate),
    description: text(e.description),
  }));
  const current = ((profile.currentPosition as Json[]) ?? [])[0];
  const experiences = topRoles(roles);
  return {
    linkedin_slug: slug,
    source: "apify",
    fetched_at: fetchedAt,
    headline: text(profile.headline),
    summary: text(profile.about),
    current_title: text(current?.position) ?? experiences.find((r) => r.ends_at === null)?.title ?? null,
    current_company: text(current?.companyName) ?? experiences.find((r) => r.ends_at === null)?.company ?? null,
    skills: [...new Set(((profile.skills as Json[]) ?? []).map((s) => text(s.name)).filter((s): s is string => !!s))],
    experiences,
    education: ((profile.education as Json[]) ?? []).map((e) => ({
      school: text(e.schoolName),
      degree: text(e.degree),
      field: text(e.fieldOfStudy),
    })),
    raw: pick(profile, APIFY_RAW_KEYS),
  };
}

function fromEnrichLayer(row: Json): Row | null {
  const slug = text(row.linkedin_slug)?.toLowerCase();
  if (!slug || row.source !== "enrichlayer") return null;
  const experiences = topRoles(
    ((row.experiences as Json[]) ?? []).map((e) => ({
      title: text(e.title),
      company: text(e.company),
      starts_at: month(e.starts_at),
      ends_at: e.ends_at ? month(e.ends_at) : null,
      description: text(e.description),
    })),
  );
  // EnrichLayer's own pick is unreliable with concurrent roles; prefer the first open-ended one.
  const current = experiences.find((r) => r.ends_at === null);
  return {
    linkedin_slug: slug,
    source: "enrichlayer",
    fetched_at: text(row.fetched_at) ?? new Date().toISOString(),
    headline: text(row.headline),
    summary: text(row.summary),
    current_title: current?.title ?? text(row.current_title),
    current_company: current ? current.company : text(row.current_company),
    skills: [...new Set(((row.skills as unknown[]) ?? []).map(text).filter((s): s is string => !!s))],
    experiences,
    education: ((row.education as Json[]) ?? []).map((e) => ({
      school: text(e.school),
      degree: text(e.degree),
      field: text(e.field),
    })),
    raw: pick((row.raw as Json) ?? {}, ENRICHLAYER_RAW_KEYS),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const dryRun = args.includes("--dry-run") || !!out;
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length === 0) throw new Error("Usage: import-linkedin-enrichment.ts [--dry-run] <file.json>...");

  const rows = new Map<string, Row>();
  let skipped = 0;
  for (const file of files) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    // Apify items carry no fetch time; the export file's time stands in.
    const parsed = Array.isArray(data)
      ? data.map((p: Json) => fromApify(p, statSync(file).mtime.toISOString()))
      : Array.isArray(data?.rows)
        ? data.rows.map(fromEnrichLayer)
        : null;
    if (!parsed) throw new Error(`${file}: not an Apify export or an EnrichLayer export`);
    for (const row of parsed as (Row | null)[]) {
      if (!row) {
        skipped++;
        continue;
      }
      const key = `${row.linkedin_slug}|${row.source}`;
      const existing = rows.get(key);
      if (!existing || existing.fetched_at < row.fetched_at) rows.set(key, row);
    }
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: guests, error: guestsError } = await supabase.from("luma_guests").select("linkedin_url");
  if (guestsError) throw new Error(guestsError.message);
  const guestSlugs = new Set(guests.map((g) => linkedinSlug(g.linkedin_url)).filter(Boolean));

  const all = [...rows.values()];
  const count = (source: Row["source"]) => all.filter((r) => r.source === source);
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
