import type { Recipe } from "@/lib/recipe-schema";

/** Soft tints the cover picks from; the glyph stays `text-ink-soft` on all of them. */
export const COVER_TINTS = ["bg-terra-soft", "bg-forest-soft", "bg-warn-soft"] as const;

type CoverRecipe = Pick<Recipe, "title" | "cuisine" | "course">;

/** Same recipe, same tint: hash cuisine, then course, then title. */
export function coverTint(recipe: CoverRecipe): (typeof COVER_TINTS)[number] {
  const key = (recipe.cuisine?.trim() || recipe.course?.trim() || recipe.title.trim()).toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return COVER_TINTS[hash % COVER_TINTS.length];
}

/** First character of the title, uppercased; code-point safe so emoji stay whole. */
export function coverInitial(title: string): string {
  const [first = ""] = Array.from(title.trim());
  return first.toLocaleUpperCase();
}

/**
 * Generated recipe cover: a flat tint plus a large serif initial. Pure CSS,
 * no image or network. Decorative, so it is hidden from assistive tech.
 */
export function RecipeCover({ recipe, className }: { recipe: CoverRecipe; className?: string }) {
  const initial = coverInitial(recipe.title);
  return (
    <div
      aria-hidden="true"
      data-recipe-cover=""
      className={["@container flex items-center justify-center overflow-hidden select-none", coverTint(recipe), className].filter(Boolean).join(" ")}
    >
      {initial && (
        <span className="font-serif leading-none text-ink-soft text-[clamp(3rem,22cqi,10rem)]">
          {initial}
        </span>
      )}
    </div>
  );
}
