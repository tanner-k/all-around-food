"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Recipe, Ingredient } from "@/lib/recipe-schema";
import { InlineAmountText } from "./InlineAmountText";
import { pageTitle } from "@/lib/typography";
import { markCookedAction } from "@/app/(app)/cookbook/actions";

interface RecipeDetailProps {
  recipe: Recipe;
}

function PillMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center bg-paper-2 text-ink-soft px-3 py-1 rounded-full text-sm border border-line">
      {children}
    </span>
  );
}

function IngredientRow({ ing }: { ing: Ingredient }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span className="text-ink-mute flex-shrink-0">·</span>
      <span className="text-ink">{ing.name}</span>
      <span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap">
        {ing.quantity.as_written}
      </span>
      {ing.preparation && (
        <span className="text-ink-mute text-xs">{ing.preparation}</span>
      )}
      {ing.optional && (
        <span className="text-ink-mute text-xs italic">optional</span>
      )}
    </li>
  );
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const router = useRouter();

  const displayTime = recipe.total_time_min ?? recipe.cook_time_min;
  const breadcrumb = [recipe.course, displayTime ? `${displayTime} min` : null]
    .filter(Boolean)
    .join(" · ");

  // Split title: last word gets italic terra treatment
  const words = recipe.title.trim().split(/\s+/);
  const titleStart = words.slice(0, -1).join(" ");
  const titleEnd = words[words.length - 1];

  // Meta pills
  const metaPills: React.ReactNode[] = [];
  if (displayTime) metaPills.push(<>⏱ {displayTime} min</>);
  if (recipe.servings) metaPills.push(<>serves {recipe.servings}</>);
  if (recipe.nutrition?.kcal) metaPills.push(<>{recipe.nutrition.kcal} kcal</>);
  if (recipe.difficulty)
    metaPills.push(
      <span className="capitalize">{recipe.difficulty}</span>
    );

  // Group ingredients
  const groups = recipe.ingredients.reduce<Map<string, Ingredient[]>>(
    (acc, ing) => {
      const key = ing.group ?? "__ungrouped__";
      const list = acc.get(key) ?? [];
      return new Map(acc).set(key, [...list, ing]);
    },
    new Map()
  );
  const hasGroups =
    groups.size > 1 ||
    (groups.size === 1 && !groups.has("__ungrouped__"));

  async function handleMarkCooked() {
    await markCookedAction(recipe.id);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      {breadcrumb && (
        <p className="text-ink-mute text-xs uppercase tracking-wide">
          {breadcrumb}
        </p>
      )}

      {/* Title */}
      <h1 className={`font-serif leading-tight text-ink ${pageTitle}`}>
        {titleStart && <>{titleStart} </>}
        <em className="italic text-terra not-italic">{titleEnd}</em>
      </h1>

      {/* Hero placeholder — 16:10 */}
      <div className="w-full rounded-xl bg-paper-2" style={{ aspectRatio: "16/10" }} />

      {/* Meta pills */}
      {metaPills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {metaPills.map((pill, i) => (
            <PillMeta key={i}>{pill}</PillMeta>
          ))}
        </div>
      )}

      {/* Description */}
      {recipe.description && (
        <p className="text-ink-soft leading-relaxed">{recipe.description}</p>
      )}

      {/* Ingredients */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute mb-3">
          Ingredients
        </p>
        {hasGroups ? (
          <div className="flex flex-col gap-4">
            {[...groups.entries()].map(([group, ings]) => (
              <div key={group}>
                {group !== "__ungrouped__" && (
                  <p className="font-serif italic text-ink-soft text-sm mb-1.5">
                    {group}
                  </p>
                )}
                <ul className="flex flex-col gap-1.5">
                  {ings.map((ing, i) => (
                    <IngredientRow key={i} ing={ing} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recipe.ingredients.map((ing, i) => (
              <IngredientRow key={i} ing={ing} />
            ))}
          </ul>
        )}
      </section>

      {/* Steps */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute mb-3">
          Steps
        </p>
        <ol className="flex flex-col gap-4">
          {recipe.steps.map((step) => (
            <li key={step.order} className="flex gap-4">
              <span className="font-serif italic text-terra text-2xl leading-none flex-shrink-0 mt-0.5">
                {step.order}.
              </span>
              <p className="text-sm text-ink leading-relaxed">
                <InlineAmountText
                  instruction={step.instruction}
                  ingredients={recipe.ingredients}
                />
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Notes */}
      {recipe.notes && (
        <section className="rounded-xl bg-paper-2 p-4 text-sm text-ink-soft leading-relaxed">
          <p className="font-semibold text-ink mb-1 text-xs uppercase tracking-wide">
            Notes
          </p>
          {recipe.notes}
        </section>
      )}

      {/* Action row */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap pt-2 border-t border-line">
        <Link
          href={`/cookbook/${recipe.id}/edit`}
          className="rounded-full border border-line bg-paper px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 min-h-10 flex items-center justify-center sm:inline-flex"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={handleMarkCooked}
          className="rounded-full border border-line bg-paper px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 min-h-10"
        >
          Mark cooked
        </button>
        <Link
          href={`/cookbook/${recipe.id}/cook`}
          className="rounded-full bg-terra px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#A55230] sm:ml-auto min-h-11 flex items-center justify-center"
        >
          Start cook mode →
        </Link>
      </div>
    </div>
  );
}
