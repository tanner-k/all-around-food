/** Shape-matched placeholder for recipe detail while the local snapshot opens. */
export function RecipeDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading recipe" data-testid="recipe-detail-skeleton" className="mx-auto max-w-3xl">
      <span className="sr-only">Opening your local cookbook…</span>
      <div aria-hidden="true" className="flex flex-col gap-8 motion-safe:animate-pulse">
        <div className="h-3 w-32 rounded-control bg-paper-2" />
        <div className="h-10 w-2/3 rounded-control bg-paper-2 md:h-12" />
        <div className="aspect-[16/10] w-full rounded-card bg-paper-2" />
        <div className="flex flex-wrap gap-2">
          {["w-20", "w-24", "w-20", "w-16"].map((width, index) => (
            <div key={index} className={`h-7 rounded-full border border-line bg-paper-2 ${width}`} />
          ))}
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2.5">
            <div className="mb-1 h-3 w-24 rounded-control bg-paper-2" />
            {["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"].map((width, index) => (
              <div key={index} className={`h-4 rounded-control bg-paper-2 ${width}`} />
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <div className="mb-1 h-3 w-16 rounded-control bg-paper-2" />
            {[0, 1, 2].map((step) => (
              <div key={step} className="flex gap-4">
                <div className="h-6 w-6 shrink-0 rounded-control bg-paper-2" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-4 w-full rounded-control bg-paper-2" />
                  <div className="h-4 w-2/3 rounded-control bg-paper-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
