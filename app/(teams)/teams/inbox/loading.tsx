import { PageSkeleton } from "../_components/page-skeleton";

export default function Loading() {
  return <PageSkeleton label="Loading inbox…" rows={4} />;
}
