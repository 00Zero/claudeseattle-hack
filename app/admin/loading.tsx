import { PageSkeleton } from "@/components/site/page-skeleton";

// Switching admin tabs. The admin layout (tabs) stays; app/loading.tsx covers the first click on /admin.
export default function Loading() {
  return <PageSkeleton label="Loading admin…" rows={6} />;
}
