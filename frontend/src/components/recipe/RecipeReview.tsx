"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/recipe-schema";
import { InlineAmountText } from "./InlineAmountText";

interface RecipeReviewProps {
  recipe: Recipe;
  onSave: (recipe: Recipe) => void;
}


export function RecipeReview({ recipe: initialRecipe, onSave }: RecipeReviewProps) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [editing, setEditing] = useState(false);
  const [showAllIngredients, setShowAllIngredients] = useState(false);

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
      {/* Hero placeholder */}
      <div className="aspect-video w-full rounded-2xl bg-paper-2" />

      {/* Title + meta row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {editing ? (
            <input
              value={recipe.title}
              onChange={(e) =>
                setRecipe((r) => ({ ...r, title: e.target.value }))
              }
              className="font-serif text-4xl text-ink bg-transparent border-b border-terra focus:outline-none w-full"
            />
          ) : (
            <h2 className="font-serif text-4xl text-ink leading-tight">
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
              <span className="text-ink">{ing.name}</span>
              <span className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-xs font-medium">
                {ing.quantity.as_written}
              </span>
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
              <p className="text-sm text-ink leading-relaxed">
                <InlineAmountText
                  instruction={step.instruction}
                  inlineAmounts={step.inline_amounts}
                />
              </p>
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
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-line bg-paper px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
        >
          {editing ? "Done" : "Edit"}
        </button>
        <button
          type="button"
          onClick={() => onSave(recipe)}
          className="rounded-full bg-terra px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-[#A55230]"
        >
          Save
        </button>
      </div>
    </div>
  );
}
