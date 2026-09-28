"use client";

import { useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";

interface RecipeOption {
  id: string;
  title: string;
}

interface RecipePickerModalProps {
  recipes: RecipeOption[];
  /** Shown under the heading, e.g. "Mon 21". */
  dayLabel?: string;
  onPick: (recipeId: string) => void;
  onClose: () => void;
}

/** Case-insensitive title match; an empty query keeps every recipe. */
export function filterRecipes<T extends RecipeOption>(recipes: T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle ? recipes.filter((recipe) => recipe.title.toLocaleLowerCase().includes(needle)) : recipes;
}

// Only jump into the search field where a keyboard is likely; on touch it would cover the list.
function prefersSearchFocus(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

export function RecipePickerModal({ recipes, dayLabel, onPick, onClose }: RecipePickerModalProps) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusSearch] = useState(prefersSearchFocus);
  const [query, setQuery] = useState("");
  const matches = filterRecipes(recipes, query);

  return (
    <Sheet open onClose={onClose} aria-labelledby={titleId} initialFocusRef={focusSearch ? searchRef : undefined}>
      <div className="flex flex-col px-5 pt-3 md:px-6 md:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-serif text-2xl text-ink">Pick a <em className="italic text-terra">recipe</em></h2>
            <p className="mt-1 text-sm text-ink-mute">{dayLabel ? `Adding to ${dayLabel}.` : "Choose a recipe from your cookbook."}</p>
          </div>
          <IconButton aria-label="Close" onClick={onClose} icon={<X className="size-5" />} className="-mr-2" />
        </div>

        {recipes.length > 0 && <div className="relative mt-4">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
          <input ref={searchRef} type="search" aria-label="Search recipes" placeholder="Search recipes"
            value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off"
            className="min-h-11 w-full rounded-control border border-line bg-bg pl-9 pr-3 text-base text-ink placeholder:text-ink-mute focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus md:text-sm [&::-webkit-search-cancel-button]:appearance-none" />
        </div>}

        <div className="mt-2 min-h-40 md:max-h-[50vh] md:overflow-y-auto">
          {recipes.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-mute">No saved recipes yet.</p>
          ) : matches.length === 0 ? (
            <p role="status" className="py-10 text-center text-sm text-ink-mute">No recipes match “{query.trim()}”.</p>
          ) : (
            <ul>
              {matches.map((recipe) => <li key={recipe.id} className="border-b border-line last:border-b-0">
                <button type="button" onClick={() => onPick(recipe.id)}
                  className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center rounded-control px-2 py-2.5 text-left text-base text-ink transition-colors hover:bg-paper-2 hover:text-terra-strong focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus md:text-sm">
                  {recipe.title}
                </button>
              </li>)}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
