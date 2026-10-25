import { PageSkeleton } from "@/components/site/page-skeleton";

export default function Loading() {
  return <PageSkeleton label="Loading your profile…" rows={4} />;
}
