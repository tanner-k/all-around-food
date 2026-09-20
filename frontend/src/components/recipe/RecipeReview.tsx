"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/recipe-schema";
import { InlineAmountText } from "./InlineAmountText";

interface RecipeReviewProps {
  recipe: Recipe;
  onSave: (recipe: Recipe) => void | Promise<void>;
  onChange?: (recipe: Recipe) => void;
  warnings?: string[];
  saveLabel?: string;
}


export function RecipeReview({ recipe: initialRecipe, onSave, onChange, warnings = [], saveLabel = "Save" }: RecipeReviewProps) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [editing, setEditing] = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(next: Recipe) {
    setRecipe(next);
    onChange?.(next);
  }

  async function save() {
    if (!recipe.title.trim() || !recipe.ingredients.some((item) => item.name.trim()) || !recipe.steps.some((step) => step.instruction.trim())) {
      setError("Add a title, an ingredient, and a step before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try { await onSave(recipe); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save recipe"); setSaving(false); }
  }

  const meta = [
    recipe.cook_time_min != null && `${recipe.cook_time_min} min`,
    recipe.servings != null && `serves ${recipe.servings}`,
    recipe.nutrition?.kcal != null && `${recipe.nutrition.kcal} kcal`,
  ].filter(Boolean) as string[];

  const displayIngredients = showAllIngredients
    ? recipe.ingredients
    : recipe.ingredients.slice(0, 8);

  const hiddenCount = recipe.ingredients.length - 8;

  return (
    <div className="flex flex-col gap-6">
      {warnings.length > 0 && <div className="rounded-xl border border-terra/40 bg-terra-soft p-4 text-sm text-ink" role="note">
        <p className="font-semibold">Check these details before saving</p>
        <ul className="mt-2 list-disc pl-5">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </div>}
      {/* Hero placeholder */}
      <div className="aspect-video w-full rounded-2xl bg-paper-2" />

      {/* Title + meta row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {editing ? (
            <input
              aria-label="Recipe title"
              value={recipe.title}
              onChange={(e) => change({ ...recipe, title: e.target.value })}
              className="font-serif text-2xl md:text-4xl text-ink bg-transparent border-b border-terra focus:outline-none w-full"
            />
          ) : (
            <h2 className="font-serif text-2xl md:text-4xl text-ink leading-tight">
              {recipe.title}
            </h2>
          )}

          {/* Meta pills */}
          {meta.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {meta.map((m) => (
                <span
                  key={m}
                  className="bg-paper-2 text-ink-soft px-3 py-1 rounded-full text-sm border border-line"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
          {editing && <label className="flex items-center gap-2 text-sm text-ink-soft">Servings
            <input type="number" min="1" value={recipe.servings ?? ""}
              onChange={(event) => change({ ...recipe, servings: event.target.value ? Number(event.target.value) : null })}
              className="w-20 rounded border border-line bg-paper px-2 py-1 text-ink" />
          </label>}
        </div>

        {/* Parsed badge */}
        <span className="inline-block text-xs uppercase tracking-wide bg-terra-soft text-terra px-2 py-0.5 rounded flex-shrink-0">
          parsed
        </span>
      </div>

      {/* Ingredients */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
          Ingredients · tap to edit
        </p>
        <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
          {displayIngredients.map((ing, idx) => (
            <li key={idx} className="flex items-baseline gap-2">
              <span className="text-ink-mute">·</span>
              {editing ? <>
                <input aria-label={`Ingredient ${idx + 1} name`} value={ing.name} onChange={(e) => change({ ...recipe,
                  ingredients: recipe.ingredients.map((item, index) => index === idx ? { ...item, name: e.target.value } : item),
                })} className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1 text-ink" />
                <input aria-label={`Ingredient ${idx + 1} amount`} value={ing.quantity.as_written} onChange={(e) => change({ ...recipe,
                  ingredients: recipe.ingredients.map((item, index) => index === idx ? { ...item, quantity: { ...item.quantity, as_written: e.target.value } } : item),
                })} className="w-24 rounded border border-line bg-paper px-2 py-1 text-ink" />
              </> : <><span className="text-ink">{ing.name}</span><span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-xs font-medium">{ing.quantity.as_written}</span></>}
              {ing.preparation && (
                <span className="text-ink-mute text-xs">{ing.preparation}</span>
              )}
            </li>
          ))}
        </ul>
        {!showAllIngredients && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllIngredients(true)}
            className="text-sm text-terra hover:underline text-left"
          >
            + {hiddenCount} more
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
          Steps
        </p>
        <ol className="flex flex-col gap-4">
          {recipe.steps.map((step) => (
            <li key={step.order} className="flex gap-4">
              <span className="font-serif italic text-terra text-2xl leading-none flex-shrink-0 mt-0.5">
                {step.order}.
              </span>
              {editing ? <textarea aria-label={`Step ${step.order} instruction`} value={step.instruction} onChange={(e) => change({ ...recipe,
                steps: recipe.steps.map((item) => item.order === step.order ? { ...item, instruction: e.target.value } : item),
              })} className="min-h-20 w-full rounded border border-line bg-paper p-2 text-sm text-ink" /> : <p className="text-sm text-ink leading-relaxed">
                <InlineAmountText
                  instruction={step.instruction}
                  ingredients={recipe.ingredients}
                />
              </p>}
            </li>
          ))}
        </ol>
      </div>

      {/* Dietary tags */}
      {recipe.dietary_tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recipe.dietary_tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-paper-2 border border-line rounded-full text-xs text-ink-soft"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-line bg-paper px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2 min-h-10"
        >
          {editing ? "Done" : "Edit"}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-terra px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230] min-h-11"
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
