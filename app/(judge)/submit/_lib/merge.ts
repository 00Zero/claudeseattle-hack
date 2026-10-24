// Merging teammates' saves field by field. Used by saveEntry and by the entry form, which brings
// in teammates' saves as they land, so nothing here is server-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntryLink, EntryValues } from "./entry";

export type Field = keyof EntryValues;

export const FIELD_LABELS: Record<Field, string> = {
  title: "Title",
  tagline: "Tagline",
  description_short: "Short description",
  description_long: "Long description",
  video_url: "Demo video link",
  repo_url: "GitHub repo link",
  links: "Other links",
};

export const FIELDS = Object.keys(FIELD_LABELS) as Field[];

// A saved version of the entry: its fields, when it was saved, and by whom.
export type SavedEntry = { values: EntryValues; savedAt: string | null; savedBy: string | null };

type EntryRow = {
  title: string | null;
  tagline: string | null;
  description_short: string | null;
  description_long: string | null;
  video_url: string | null;
  repo_url: string | null;
  links: unknown;
  last_saved_at: string | null;
  saver: unknown;
};

const SAVED_ENTRY_COLUMNS =
  "title, tagline, description_short, description_long, video_url, repo_url, links, last_saved_at, saver:profiles!judge_entries_last_saved_by_fkey(display_name)";

export function entryValues(row: Omit<EntryRow, "last_saved_at" | "saver">): EntryValues {
  return {
    title: row.title ?? "",
    tagline: row.tagline ?? "",
    description_short: row.description_short ?? "",
    description_long: row.description_long ?? "",
    video_url: row.video_url ?? "",
    repo_url: row.repo_url ?? "",
    links: Array.isArray(row.links) ? (row.links as EntryLink[]) : [],
  };
}

function toSavedEntry(row: EntryRow): SavedEntry {
  return {
    values: entryValues(row),
    savedAt: row.last_saved_at,
    savedBy: (row.saver as { display_name: string } | null)?.display_name ?? null,
  };
}

// The team's saved entry, read as the caller (RLS: team members only).
export async function loadSavedEntry(supabase: SupabaseClient, teamId: string): Promise<SavedEntry | null> {
  const { data } = await supabase.from("judge_entries").select(SAVED_ENTRY_COLUMNS).eq("team_id", teamId).maybeSingle();
  return data ? toSavedEntry(data) : null;
}

// Writes the entry only if it's still the saved version `current` (or, without one, doesn't exist
// yet) and returns the new saved version, or null if a teammate saved first.
export async function writeEntry(
  supabase: SupabaseClient,
  teamId: string,
  current: SavedEntry | null,
  row: Record<string, unknown>,
): Promise<{ saved: SavedEntry | null; error: { code: string } | null }> {
  const { data, error } = current
    ? await supabase
        .from("judge_entries")
        .update(row)
        .eq("team_id", teamId)
        .filter("last_saved_at", current.savedAt ? "eq" : "is", current.savedAt)
        .select(SAVED_ENTRY_COLUMNS)
    : await supabase.from("judge_entries").insert({ ...row, team_id: teamId }).select(SAVED_ENTRY_COLUMNS);
  return { saved: data?.length ? toSavedEntry(data[0]) : null, error };
}

// Links as the save stores them: blank URLs dropped, a blank label falls back to the URL.
export function cleanLinks(links: EntryLink[]): EntryLink[] {
  return links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.url)
    .map((link) => ({ label: link.label || link.url, url: link.url }));
}

// Textareas submit \r\n; the save trims.
const norm = (value: unknown) => String(value ?? "").replace(/\r\n/g, "\n").trim();

export function same(a: EntryValues[Field], b: EntryValues[Field]) {
  if (typeof a === "string" || typeof b === "string") return norm(a) === norm(b);
  const key = (links: EntryLink[]) => JSON.stringify(links.map((link) => [norm(link.label), norm(link.url)]));
  return key(a) === key(b);
}

export function withField(values: EntryValues, field: Field, value: EntryValues[Field]): EntryValues {
  return { ...values, [field]: value };
}

// Three-way merge. `base` is the saved version the editor last had, `mine` what they're saving,
// `theirs` what's saved now. A field only one side changed takes that side's value; a field both
// changed to different values is a conflict (values keeps mine there). `kept` lists teammates'
// changes taken in.
export function mergeValues(base: EntryValues, mine: EntryValues, theirs: EntryValues) {
  let values = mine;
  const conflicts: Field[] = [];
  const kept: Field[] = [];
  for (const field of FIELDS) {
    if (same(mine[field], theirs[field]) || same(theirs[field], base[field])) continue;
    if (same(mine[field], base[field])) {
      values = withField(values, field, theirs[field]);
      kept.push(field);
    } else {
      conflicts.push(field);
    }
  }
  return { values, conflicts, kept };
}

// "Title", "Title and Tagline", "Title, Tagline and Other links".
export function fieldList(fields: Field[]) {
  const labels = fields.map((field) => FIELD_LABELS[field]);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : (labels[0] ?? "");
}
