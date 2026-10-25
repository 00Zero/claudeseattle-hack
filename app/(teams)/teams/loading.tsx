import { PageSkeleton } from "./_components/page-skeleton";

export default function Loading() {
  return <PageSkeleton label="Loading teams…" cards={4} rows={0} />;
}
