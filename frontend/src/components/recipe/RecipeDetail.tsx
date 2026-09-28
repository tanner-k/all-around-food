"use client";

import { useState } from "react";
import type { Recipe, Ingredient } from "@/lib/recipe-schema";
import { InlineAmountText } from "./InlineAmountText";
import { RecipeCover } from "./RecipeCover";
import { pageTitle } from "@/lib/typography";
import { localHref } from "@/lib/local/navigation";
import { formatIngredientAmount } from "@/lib/format-quantity";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Menu } from "@/components/ui/Menu";

interface RecipeDetailProps {
  recipe: Recipe;
  onMarkCooked: () => Promise<void>;
  onDelete: () => Promise<void>;
  onStartCook: () => Promise<void>;
}

function PillMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center tabular-nums bg-paper-2 text-ink-soft px-3 py-1 rounded-full text-sm border border-line">
      {children}
    </span>
  );
}

function IngredientRow({ ing }: { ing: Ingredient }) {
  return (
    <li className="flex items-baseline gap-3 border-b border-line py-2 text-sm last:border-b-0">
      <span className="w-20 shrink-0 text-right font-medium tabular-nums text-terra-strong">
        {formatIngredientAmount(ing.quantity)}
      </span>
      <span className="min-w-0 text-ink">
        {ing.name}
        {ing.preparation && (
          <span className="text-ink-mute">, {ing.preparation}</span>
        )}
        {ing.optional && (
          <span className="ml-1.5 text-ink-mute text-xs italic">optional</span>
        )}
      </span>
    </li>
  );
}

export function RecipeDetail({ recipe, onMarkCooked, onStartCook, onDelete }: RecipeDetailProps) {
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const displayTime = recipe.total_time_min ?? recipe.cook_time_min;
  const breadcrumb = [recipe.course, displayTime ? `${displayTime} min` : null]
    .filter(Boolean)
    .join(" · ");

  // Split title: last word gets italic terra treatment
  const words = recipe.title.trim().split(/\s+/);
  const titleStart = words.slice(0, -1).join(" ");
  const titleEnd = words[words.length - 1];

  // Meta pills. Time lives only in the breadcrumb, which still shows it
  // when there is no course.
  const metaPills: React.ReactNode[] = [];
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
    setBusy(true);
    try { await onMarkCooked(); setLogged(true); } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save cooking session.");
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true); setError(null);
    try { await onDelete(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to delete recipe."); }
    finally { setBusy(false); setConfirmingDelete(false); }
  }

  return (
    <div data-recipe-detail={recipe.id} className="flex flex-col gap-8 max-w-3xl lg:max-w-4xl mx-auto">
      {/* Breadcrumb */}
      {breadcrumb && (
        <p className="text-ink-mute text-xs uppercase tracking-wide">
          {breadcrumb}
        </p>
      )}

      {/* Title */}
      <h1 data-recipe-title="" className={`font-serif leading-tight text-ink text-balance break-words hyphens-auto ${pageTitle}`}>
        {titleStart && <>{titleStart} </>}
        <em className="italic text-terra not-italic">{titleEnd}</em>
      </h1>

      {/* Hero cover: 16:10 on phones, a 240px banner from md: so it never dominates the page */}
      <RecipeCover recipe={recipe} className="aspect-[16/10] w-full rounded-card md:aspect-auto md:h-60" />

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

      {/* Actions. On phones the wrapper dissolves (display: contents) so
          "Start cooking" can sit last in the column and stick above the tab
          bar; from md it joins the row. The fallback applies until the shared
          --tabbar-height lands. */}
      <div className="contents md:flex md:items-center md:gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={handleMarkCooked}
            disabled={busy || logged}
            className="flex-1 md:flex-none"
          >
            {logged ? <>Cooked <span aria-hidden="true" className="text-[1em] leading-none align-[-0.05em]">✓</span></> : "Mark cooked"}
          </Button>
          <Menu
            label="Recipe options"
            items={[
              { label: "Edit", onSelect: () => { window.location.href = localHref("edit", recipe.id); } },
              { label: "Delete", danger: true, disabled: busy, onSelect: () => setConfirmingDelete(true) },
            ]}
          />
        </div>
        <div className="order-last sticky z-30 bottom-[calc(var(--tabbar-height,calc(3.5rem+env(safe-area-inset-bottom)))+0.75rem)] rounded-full shadow-raised md:static md:order-none md:ml-auto md:shadow-none">
          <Button
            href={localHref("cook", recipe.id)}
            size="lg"
            fullWidth
            onClick={(event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); void onStartCook().catch((err: unknown) => setError(err instanceof Error ? err.message : "Unable to start cook mode.")); }}
          >
            Start cooking
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-8 md:grid md:grid-cols-[minmax(260px,320px)_1fr] md:gap-10">
        {/* Ingredients */}
        <section className="md:sticky md:top-6 md:self-start md:max-h-[calc(100dvh-3rem)] md:overflow-y-auto">
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
                  <ul className="flex flex-col">
                    {ings.map((ing, i) => (
                      <IngredientRow key={i} ing={ing} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="flex flex-col">
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
                <span className="w-7 text-right font-serif italic text-terra text-2xl leading-none flex-shrink-0 mt-0.5">
                  <span className="tabular-nums">{step.order}</span>.
                </span>
                <p className="text-sm text-ink leading-relaxed text-pretty">
                  <InlineAmountText
                    instruction={step.instruction}
                    ingredients={recipe.ingredients}
                    variant="inline"
                  />
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Notes */}
      {recipe.notes && (
        <section className="rounded-xl bg-paper-2 p-4 text-sm text-ink-soft leading-relaxed">
          <p className="font-semibold text-ink mb-1 text-xs uppercase tracking-wide">
            Notes
          </p>
          {recipe.notes}
        </section>
      )}

      <Dialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void handleDelete()}
        title="Delete recipe?"
        description={`Delete “${recipe.title}” from your cookbook? If this recipe is connected to your account, its deletion will sync when online. Plans and other references are kept.`}
        confirmLabel="Delete"
        variant="danger"
        busy={busy}
      />
    </div>
  );
}
