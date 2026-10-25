// Shown by loading.tsx files while a page renders on the server, so a click answers at once.
// Same look as the Teams skeleton (app/(teams)/teams/_components/page-skeleton.tsx).

const bar = "animate-pulse rounded bg-line";

export function PageSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label={label}>
      <div className="space-y-3">
        <div className={`${bar} h-4 w-24`} />
        <div className={`${bar} h-7 w-56`} />
        <div className={`${bar} h-9 w-full`} />
      </div>
      {rows > 0 && (
        <div className="divide-y divide-line rounded-lg border border-line bg-bg-raised">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <div className={`${bar} h-4 w-48`} />
              <div className={`${bar} h-3 w-32`} />
            </div>
          ))}
        </div>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
