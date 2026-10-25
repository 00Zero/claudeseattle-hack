// Sections of /resources, in page order. Mirrors the check on resources.section
// (20261022003229_shared_resources.sql).
export const RESOURCE_SECTIONS = [
  { key: "credits", label: "Credits" },
  { key: "event", label: "At the event" },
  { key: "building", label: "For building" },
] as const;

export type ResourceSection = (typeof RESOURCE_SECTIONS)[number]["key"];

export type Resource = {
  id: string;
  section: ResourceSection;
  title: string;
  description: string | null;
  url: string;
  sort_order: number;
  visible: boolean;
};

// A Google Drive folder link gets its own card on /resources (app/resources/drive-folder-card.tsx).
// Lives here, not in that client component, because the server page calls it.
export function isDriveFolder(url: string) {
  return /^https:\/\/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(url);
}
