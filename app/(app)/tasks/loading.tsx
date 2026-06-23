export default function Loading() {
  return (
    <div className="w-full">
      <div className="mb-3 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
        ))}
      </div>
    </div>
  );
}
