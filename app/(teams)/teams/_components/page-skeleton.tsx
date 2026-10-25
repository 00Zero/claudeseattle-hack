// Shown by the loading.tsx files while a Teams page loads on the server, so a tap answers at once.

const bar = "animate-pulse rounded bg-line";

export function PageSkeleton({ label, cards = 0, rows = 3 }: { label: string; cards?: number; rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label={label}>
      <div className="space-y-3">
        <div className={`${bar} h-4 w-24`} />
        <div className={`${bar} h-7 w-56`} />
        <div className={`${bar} h-9 w-full`} />
      </div>
      {cards > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-line bg-bg-raised p-4">
              <div className={`${bar} h-5 w-40`} />
              <div className={`${bar} h-4 w-full`} />
              <div className={`${bar} h-4 w-2/3`} />
            </div>
          ))}
        </div>
      )}
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
