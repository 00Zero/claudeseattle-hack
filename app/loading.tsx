import { PageSkeleton } from "@/components/site/page-skeleton";

// The home page, and the first load of any section without its own loading.tsx (/admin, /submit,
// /judge, /resources, ...), so a header click shows something at once even when the server is slow.
export default function Loading() {
  return <PageSkeleton label="Loading…" />;
}
