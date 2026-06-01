"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, type Recipe, ApiError } from "@/lib/api";
import { recipeToShoppingItems } from "@/lib/shopping";

interface RecipeDetailViewProps {
  recipeId: string;
}

export function RecipeDetailView({ recipeId }: RecipeDetailViewProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingToShop, setAddingToShop] = useState(false);
  const [shopDone, setShopDone] = useState(false);
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [planDone, setPlanDone] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.recipes.get(recipeId);
      setRecipe(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Recipe not found.");
      } else {
        setError("Could not load recipe. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    // Fetch-on-mount: state is updated after the awaited fetch resolves, a
    // legitimate external-sync use of an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleAddToShop() {
    if (!recipe?.ingredients) return;
    setAddingToShop(true);
    try {
      const items = recipeToShoppingItems(recipe.id, recipe.ingredients);
      await Promise.all(items.map((item) => api.shop.create(item)));
      setShopDone(true);
    } catch {
      // silently fall back — user can retry
    } finally {
      setAddingToShop(false);
    }
  }

  async function handleAddToPlan() {
    if (!recipe) return;
    setAddingToPlan(true);
    // Default to today, dinner
    const today = new Date().toISOString().split("T")[0]!;
    try {
      await api.plan.create({ recipeId: recipe.id, scheduledFor: today, mealType: "dinner" });
      setPlanDone(true);
    } catch {
      // silently fall back
    } finally {
      setAddingToPlan(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-line rounded w-1/3" />
        <div className="aspect-[16/9] bg-line rounded-xl" />
        <div className="space-y-2">
          <div className="h-4 bg-line rounded w-full" />
          <div className="h-4 bg-line rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <EmptyState
        icon="⚠️"
        title="Recipe not found"
        description={error ?? "This recipe could not be loaded."}
        action={
          <Link href="/cookbook" className="text-sm text-terra underline">
            ← Back to Cookbook
          </Link>
        }
      />
    );
  }

  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];

  return (
    <>
      <div className="mb-4">
        <Link
          href="/cookbook"
          className="text-sm text-ink-mute transition-colors hover:text-ink"
        >
          ← Cookbook
        </Link>
      </div>

      <SectionHeader
        number="02"
        scene="RECIPE DETAIL"
        title={<em className="italic text-terra">{recipe.title}</em>}
        description={
          recipe.sourceUrl
            ? `Source: ${new URL(recipe.sourceUrl).hostname}`
            : "Imported recipe"
        }
      />

      <div className="mt-14 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10">
        {/* Left: recipe content */}
        <div className="space-y-8">
          {/* Photo placeholder */}
          <div className="aspect-[16/10] rounded-xl bg-gradient-to-br from-[#F4C9A5] to-[#D67D52]" />

          {/* Ingredients */}
          {ingredients.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute mb-3">
                Ingredients
              </p>
              <ul className="space-y-1.5">
                {ingredients.map((ing) => (
                  <li key={ing.id} className="flex items-baseline gap-2 text-sm">
                    <span className="text-ink-mute">·</span>
                    <span className="text-ink">{ing.name}</span>
                    {ing.amount !== null && (
                      <span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded text-xs font-semibold">
                        {ing.amount}
                        {ing.unit ? ` ${ing.unit}` : ""}
                      </span>
                    )}
                    {ing.notes && (
                      <span className="text-ink-mute text-xs">{ing.notes}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute mb-3">
                Steps
              </p>
              <ol className="space-y-4">
                {steps.map((step, idx) => (
                  <li key={step.id} className="flex gap-4">
                    <span
                      className="font-serif italic text-terra flex-shrink-0 leading-tight"
                      style={{ fontSize: "22px" }}
                    >
                      {idx + 1}.
                    </span>
                    <p className="text-sm text-ink leading-relaxed">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {ingredients.length === 0 && steps.length === 0 && (
            <EmptyState
              title="No content yet"
              description="This recipe has no ingredients or steps."
            />
          )}
        </div>

        {/* Right: actions */}
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-paper p-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
              Actions
            </p>

            {/* Cook now */}
            <Button
              variant="terra"
              size="lg"
              block
              onClick={() => router.push(`/cook/${recipe.id}`)}
            >
              Start cook mode →
            </Button>

            {/* Add to plan */}
            <Button
              variant="primary"
              size="lg"
              block
              disabled={addingToPlan || planDone}
              onClick={handleAddToPlan}
            >
              {planDone
                ? "✓ Added to today's plan"
                : addingToPlan
                  ? "Adding…"
                  : "Add to plan"}
            </Button>

            {/* Add ingredients to shop */}
            <Button
              size="lg"
              block
              disabled={addingToShop || shopDone || ingredients.length === 0}
              onClick={handleAddToShop}
            >
              {shopDone
                ? "✓ Ingredients added to shop"
                : addingToShop
                  ? "Adding…"
                  : `Add ${ingredients.length} ingredient${ingredients.length !== 1 ? "s" : ""} to shop`}
            </Button>
          </div>

          {/* Source */}
          {recipe.sourceUrl && (
            <div className="rounded-xl border border-line bg-paper-2 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-mute mb-1">
                Source
              </p>
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-terra hover:underline break-all"
              >
                {recipe.sourceUrl}
              </a>
            </div>
          )}

          {/* Tags / quick stats */}
          <div className="flex flex-wrap gap-2">
            {ingredients.length > 0 && (
              <Pill>{ingredients.length} ingredients</Pill>
            )}
            {steps.length > 0 && (
              <Pill>{steps.length} steps</Pill>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
