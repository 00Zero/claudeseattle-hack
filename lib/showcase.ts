// The public showcase of the Oct 2026 projects: one GitHub repo with a snapshot of every submitted project, one folder each.
// Linked from /small-businesses, and from each public entry page in case a team's own repo goes private or away.
export const showcaseRepoUrl = "https://github.com/00Zero/claude-impact-lab-seattle-oct-2026";

// Entry id -> showcase folder. Matched once by each entry's repo link against the "Original repo" column of the showcase
// README; keyed by entry id so a team changing its repo link later doesn't break it. Add a row when the showcase adds one.
const FOLDERS: Record<string, string> = {
  "78a7945b-12c0-47ad-b1c9-555b7e98061a": "alongtable", // ALongTable
  "837c369c-d960-49e1-b765-30546ae7e807": "bid-analysis", // Bid Analysis
  "30432b30-436f-4237-8ba8-0ee11b69989a": "bidwriter", // BidWriter
  "f5918cfd-6038-4faa-96ac-cdbbe8cbed2a": "bizos", // BizOS
  "448d354d-537d-4b67-8184-e494c5eb99f9": "clark", // Clark
  "272e355a-a42e-4ef6-a15e-5a2d4f698b7f": "clippy-2.0", // Clippy 2.0
  "bf5b82b1-d4fc-4bcb-aba0-d32bb8ae43ca": "crumbs", // crumbs
  "be877c34-f63e-4f5a-abe5-d3064bbd53c6": "daily-networker", // Daily Networker
  "a8fbca2b-b17c-4fb6-bfe0-aac826f23522": "datamaps", // Datamaps for small business
  "822dcc94-656f-4f10-a584-812d2343a936": "get-my-drugs", // Get my drugs
  "fe067203-9ebc-4618-9996-93ed0cc45849": "gtmagic", // GTMagic
  "e4dc8d58-c375-496a-87e3-ebca1fa03432": "home-dream-build", // Home Dream Build
  "a431094d-8b78-480c-ab23-a09df9d90672": "lantern", // Lantern
  "3ec646f0-8da6-4c16-9a84-d8183963427a": "leadline", // Leadline
  "a6fd9ae5-99f5-47ea-ae10-78f50936f3e7": "local-ai-workflows", // Local AI workflows
  "784f61b7-4a7e-4f3b-b254-7c27461c62fb": "neri-cash", // Neri Cash
  "83c8830b-cfd3-4cff-82d4-efff178590f7": "onetrip", // OneTrip
  "95579f2e-a7a3-4cee-bd63-8df1b2698136": "preheat", // Preheat: From Preorders to What to Bake, Buy, and Earn
  "4a658c19-8f2b-4633-bb65-9205bc09eec4": "ringaround", // RingAround
  "2fe708d6-c05f-43eb-a876-fbde4ef1a1b1": "send-check", // Send Check
  "bd6e86af-c887-4adb-b374-89beeb9cb0e4": "the-ledgers", // The Ledgers
  "4b1a05ee-4af5-477b-bc5e-5b044ad82fe2": "wellyfish", // Wellyfish
};

export function showcaseFolderUrl(entryId: string): string | null {
  const folder = FOLDERS[entryId];
  return folder ? `${showcaseRepoUrl}/tree/main/${folder}` : null;
}
