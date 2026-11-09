/** Shape-matched placeholder for the cookbook list while the local snapshot opens. */
export function CookbookSkeleton() {
  return (
    <div role="status" aria-label="Loading cookbook" data-testid="cookbook-skeleton">
      <span className="sr-only">Opening your local cookbook…</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr] md:gap-14">
          <div className="h-8 w-12 rounded-control bg-paper-2 md:h-20 md:w-28" />
          <div>
            <div className="mb-2.5 h-3 w-28 rounded-control bg-paper-2" />
            <div className="mb-3.5 h-9 w-4/5 rounded-control bg-paper-2 md:h-12" />
            <div className="h-4 w-3/5 max-w-[580px] rounded-control bg-paper-2" />
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <div className="h-10 w-32 rounded-full bg-paper-2" />
          <div className="h-10 w-36 rounded-full bg-paper-2" />
        </div>
        <div className="mt-8 flex items-start gap-3 sm:gap-6">
          <div className="min-w-0 flex-1">
            {[0, 1, 2].map((group) => (
              <section key={group} className="mb-8">
                <div className="mb-2 h-8 w-8 border-b border-line bg-paper-2" />
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center justify-between border-b border-line/60 py-3">
                    <div className="h-6 w-2/5 rounded-control bg-paper-2" />
                    <div className="h-4 w-24 rounded-control bg-paper-2" />
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-control border border-line bg-paper p-1">
            {[0, 1, 2, 3, 4, 5].map((letter) => (
              <div key={letter} className="h-8 w-8 rounded-control bg-paper-2" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
