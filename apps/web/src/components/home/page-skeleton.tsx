export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-12" aria-hidden>
      <div className="min-h-[26rem] animate-pulse rounded-2xl border border-border bg-card" />
      <div className="h-10 w-full animate-pulse rounded-full bg-card" />
      <div className="h-[26rem] w-full animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
