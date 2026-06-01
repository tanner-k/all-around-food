"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { RecipeCard } from "./RecipeCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, type Recipe } from "@/lib/api";

type SortKey = "recent" | "title";

export function CookbookView() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.recipes.list();
      setRecipes(data);
    } catch {
      setError("Could not load recipes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: state is updated after the awaited fetch resolves, a
    // legitimate external-sync use of an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const sorted = [...recipes].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    // recent: newest createdAt first
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  });

  const filtered = sorted.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()),
  );

  // The most recently created recipe gets "new" badge (stable across renders via state)
  const newestId =
    recipes.length > 0
      ? recipes.reduce((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate > aDate ? b : a;
        }).id
      : null;

  // Show "just added" badge: recipe is newest AND loaded within this session
  function isNew(recipe: Recipe): boolean {
    if (recipe.id !== newestId) return false;
    return recipe.createdAt !== null && recipe.createdAt !== undefined;
  }

  return (
    <>
      <SectionHeader
        number="02"
        scene="YOUR LIBRARY"
        title={
          <>
            Your <em className="italic text-terra">cookbook</em>.
          </>
        }
        description="Every recipe you've saved. Search, filter, or start cooking."
      />

      <div className="mt-14 space-y-8">
        {/* Controls row */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <input
            type="search"
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] max-w-sm rounded-full border border-line bg-paper px-4 py-1.5 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:border-ink-soft transition-colors"
          />

          {/* Sort pills */}
          <div className="flex gap-2">
            <button
              onClick={() => setSort("recent")}
              className={[
                "inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-medium transition-colors",
                sort === "recent"
                  ? "bg-ink text-paper border-ink"
                  : "bg-paper-2 text-ink-soft border-line hover:border-ink-mute",
              ].join(" ")}
            >
              recent
            </button>
            <button
              onClick={() => setSort("title")}
              className={[
                "inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-medium transition-colors",
                sort === "title"
                  ? "bg-ink text-paper border-ink"
                  : "bg-paper-2 text-ink-soft border-line hover:border-ink-mute",
              ].join(" ")}
            >
              A–Z
            </button>
          </div>

          {/* Count */}
          {!loading && recipes.length > 0 && (
            <span className="text-xs text-ink-mute ml-auto">
              {filtered.length} recipe{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* States */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[10px] border border-line bg-paper-2 overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-line" />
                <div className="px-2.5 py-2 space-y-1.5">
                  <div className="h-3 bg-line rounded w-3/4" />
                  <div className="h-2.5 bg-line rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-terra-soft border border-terra/20 px-4 py-3 text-sm text-terra">
            {error}
          </div>
        )}

        {!loading && !error && recipes.length === 0 && (
          <EmptyState
            icon="📖"
            title="No recipes yet"
            description="Import your first recipe and it'll show up here."
            action={
              <Link
                href="/import"
                className="inline-flex items-center gap-1.5 rounded-full bg-terra px-4 py-2 text-xs font-semibold text-paper hover:bg-terra/90 transition-colors"
              >
                + Import a recipe
              </Link>
            }
          />
        )}

        {!loading && !error && recipes.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon="🔍"
            title="No matches"
            description={`No recipes found for "${search}".`}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} isNew={isNew(recipe)} />
            ))}
          </div>
        )}

        {/* Import CTA */}
        {!loading && recipes.length > 0 && (
          <div className="pt-4 border-t border-line flex justify-center">
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-5 py-2.5 text-sm font-medium text-ink-soft hover:border-ink-mute hover:text-ink transition-colors"
            >
              + Import another recipe
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
