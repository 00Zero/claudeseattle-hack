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
