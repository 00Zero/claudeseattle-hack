import { PageSkeleton } from "../_components/page-skeleton";

export default function Loading() {
  return <PageSkeleton label="Loading people…" rows={5} />;
}
