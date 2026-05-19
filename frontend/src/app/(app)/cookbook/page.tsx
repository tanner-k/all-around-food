import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import type { Recipe } from "@/lib/recipe-schema";

async function getRecipes(): Promise<Recipe[]> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL ?? "http://localhost:8000"}/recipes`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    return (await res.json()) as Recipe[];
  } catch {
    return [];
  }
}

export default async function CookbookPage() {
  const recipes = await getRecipes();

  return (
    <>
      <SectionHeader
        number="02"
        scene="YOUR LIBRARY"
        title={
          <>
            Every recipe you&apos;ve{" "}
            <em className="italic text-terra">saved</em>.
          </>
        }
        description="Sorted by what you cook most."
      />

      <div className="mt-12">
        {recipes.length === 0 ? (
          <div className="rounded-2xl border border-line bg-paper p-12 text-center">
            <p className="text-ink-mute mb-4">Your cookbook is empty.</p>
            <Link
              href="/import"
              className="text-terra underline hover:no-underline"
            >
              Import your first recipe →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recipes.map((recipe, idx) => {
              const isNewest = idx === 0;
              return (
                <div
                  key={recipe.id || idx}
                  className={[
                    "rounded-xl overflow-hidden bg-paper",
                    isNewest
                      ? "border-2 border-terra"
                      : "border border-line",
                  ].join(" ")}
                >
                  {/* Photo placeholder */}
                  <div className="aspect-video bg-paper-2" />

                  {/* Body */}
                  <div className="p-4 flex flex-col gap-1">
                    <p className="font-serif text-xl text-ink leading-tight">
                      {recipe.title}
                    </p>
                    <p
                      className={[
                        "text-sm",
                        isNewest ? "text-terra" : "text-ink-mute",
                      ].join(" ")}
                    >
                      {recipe.times_made === 0
                        ? "just added"
                        : `${recipe.times_made}× this year`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
