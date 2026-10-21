// LinkedIn enrichment: turns Apify (harvestapi/linkedin-profile-scraper) and EnrichLayer
// exports into linkedin_enrichment rows (20261021073547_shared_enrichment_sources.sql).
// Pure and browser-safe: used by scripts/import-linkedin-enrichment.ts and by the admin
// upload, which normalizes in the browser and sends compact rows in batches.
//
// Every source is normalized to the same columns: dates as YYYY-MM, at most 10 roles (current
// first) with descriptions cut to 500 characters, skills as names. raw keeps an allowlist of
// the person's own profile; other people (suggested profiles, recommendations), followed
// accounts, photos, emails and open-to-work status are never stored.

type Json = Record<string, unknown>;
type Role = { title: string | null; company: string | null; starts_at: string | null; ends_at: string | null; description: string | null };
type School = { school: string | null; degree: string | null; field: string | null };
export type EnrichmentRow = {
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
export function linkedinSlug(url: unknown) {
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

export function fromApify(profile: Json, fetchedAt: string): EnrichmentRow | null {
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

export function fromEnrichLayer(row: Json): EnrichmentRow | null {
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

export type ParsedFile = { rows: EnrichmentRow[]; skipped: number };

// One export file: an Apify array, or an EnrichLayer export ({ rows: [...] }). Apify items
// carry no fetch time, so the caller passes the file's time. Null if it's neither.
export function parseEnrichmentFile(data: unknown, fileTime: string): ParsedFile | null {
  const parsed = Array.isArray(data)
    ? data.map((p) => fromApify(p as Json, fileTime))
    : Array.isArray((data as Json | null)?.rows)
      ? ((data as Json).rows as Json[]).map(fromEnrichLayer)
      : null;
  if (!parsed) return null;
  const rows = parsed.filter((r): r is EnrichmentRow => r !== null);
  return { rows, skipped: parsed.length - rows.length };
}

// One row per profile per source, keeping the newest fetch.
export function newestRows(rows: EnrichmentRow[]) {
  const byKey = new Map<string, EnrichmentRow>();
  for (const row of rows) {
    const key = `${row.linkedin_slug}|${row.source}`;
    const existing = byKey.get(key);
    if (!existing || existing.fetched_at < row.fetched_at) byKey.set(key, row);
  }
  return [...byKey.values()];
}

// Server-side check of a row that came from a browser: right shape, sane sizes. Null if not.
const MAX_RAW_BYTES = 100_000;
export function cleanRow(value: unknown): EnrichmentRow | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Json;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : v == null ? null : undefined);
  const slug = typeof r.linkedin_slug === "string" ? r.linkedin_slug : "";
  if (!/^[^\s/?#A-Z]{1,200}$/.test(slug) || (r.source !== "apify" && r.source !== "enrichlayer")) return null;
  if (typeof r.fetched_at !== "string" || Number.isNaN(Date.parse(r.fetched_at))) return null;
  const fields = {
    headline: str(r.headline, 500),
    summary: str(r.summary, 5000),
    current_title: str(r.current_title, 300),
    current_company: str(r.current_company, 300),
  };
  if (Object.values(fields).some((v) => v === undefined)) return null;
  const skills = Array.isArray(r.skills) ? r.skills.filter((s): s is string => typeof s === "string").slice(0, 200) : [];
  const experiences = Array.isArray(r.experiences) ? (r.experiences as Role[]).slice(0, MAX_ROLES) : [];
  const education = Array.isArray(r.education) ? (r.education as School[]).slice(0, 20) : [];
  const raw = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? (r.raw as Json) : {};
  if (JSON.stringify(raw).length > MAX_RAW_BYTES) return null;
  return {
    linkedin_slug: slug,
    source: r.source,
    fetched_at: new Date(r.fetched_at).toISOString(),
    ...(fields as { headline: string | null; summary: string | null; current_title: string | null; current_company: string | null }),
    skills,
    experiences,
    education,
    raw,
  };
}

// Apify input for harvestapi/linkedin-profile-scraper, without the email lookup.
export function apifyInput(urls: string[]) {
  return JSON.stringify({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: urls }, null, 2);
}
