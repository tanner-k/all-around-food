import { Card } from "@/components/ui/Card";
import { RecipeCover } from "@/components/recipe/RecipeCover";
import type { Recipe } from "@/lib/recipe-schema";
import { localHref } from "@/lib/local/navigation";

/** `cuisine · total time · servings`, skipping whatever the recipe lacks. */
export function cookbookMeta(recipe: Pick<Recipe, "cuisine" | "total_time_min" | "cook_time_min" | "servings">): string {
  const time = recipe.total_time_min ?? recipe.cook_time_min;
  return [recipe.cuisine?.trim(), time ? `${time} min` : null, recipe.servings ? `serves ${recipe.servings}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** Typographic cookbook card: generated cover, title, meta, description, cooked count. */
export function CookbookCard({ recipe, featured = false }: { recipe: Recipe; featured?: boolean }) {
  const meta = cookbookMeta(recipe);
  return (
    <Card as="li" interactive padding="none" className={`overflow-hidden ${featured ? "ring-2 ring-terra" : ""}`}>
      <a href={localHref("recipe", recipe.id)} className="flex h-full flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
        <RecipeCover recipe={recipe} className="aspect-video" />
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <p className="font-serif text-xl leading-snug text-ink text-balance break-words">{recipe.title}</p>
          {meta && <p className="text-xs uppercase tracking-[0.08em] text-ink-mute tabular-nums">{meta}</p>}
          {recipe.description && <p className="line-clamp-2 text-sm italic text-ink-soft text-pretty">{recipe.description}</p>}
          <p className="mt-auto pt-1 text-sm text-ink-mute tabular-nums">{recipe.times_made ? `${recipe.times_made}× cooked` : "just added"}</p>
        </div>
      </a>
    </Card>
  );
}
