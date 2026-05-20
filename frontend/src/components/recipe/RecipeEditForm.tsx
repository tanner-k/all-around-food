"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Recipe, Ingredient, Step } from "@/lib/recipe-schema";

interface RecipeEditFormProps {
  recipe: Recipe;
}

const inputClass =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder-ink-mute focus:outline-none focus:border-terra transition-colors";

const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute mb-1";

function blankIngredient(): Ingredient {
  return {
    name: "",
    quantity: { value: null, unit: null, as_written: "" },
    preparation: null,
    optional: false,
    group: null,
    notes: null,
  };
}

function blankStep(order: number): Step {
  return {
    order,
    instruction: "",
    duration_min: null,
    temperature_f: null,
    equipment: [],
    inline_amounts: [],
  };
}

export function RecipeEditForm({ recipe: initialRecipe }: RecipeEditFormProps) {
  const router = useRouter();
  const [recipe, setRecipe] = useState(initialRecipe);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof Recipe>(key: K, value: Recipe[K]) {
    setRecipe((r) => ({ ...r, [key]: value }));
  }

  function updateIngredient(index: number, updates: Partial<Ingredient>) {
    setRecipe((r) => ({
      ...r,
      ingredients: r.ingredients.map((ing, i) =>
        i === index ? { ...ing, ...updates } : ing
      ),
    }));
  }

  function addIngredient() {
    setRecipe((r) => ({
      ...r,
      ingredients: [...r.ingredients, blankIngredient()],
    }));
  }

  function removeIngredient(index: number) {
    setRecipe((r) => ({
      ...r,
      ingredients: r.ingredients.filter((_, i) => i !== index),
    }));
  }

  function updateStep(index: number, updates: Partial<Step>) {
    setRecipe((r) => ({
      ...r,
      steps: r.steps.map((step, i) =>
        i === index ? { ...step, ...updates } : step
      ),
    }));
  }

  function addStep() {
    setRecipe((r) => ({
      ...r,
      steps: [...r.steps, blankStep(r.steps.length + 1)],
    }));
  }

  function removeStep(index: number) {
    setRecipe((r) => ({
      ...r,
      steps: r.steps
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, order: i + 1 })),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to save recipe");
      }
      router.push(`/cookbook/${recipe.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl text-ink leading-tight">
          Edit recipe
        </h1>
        <Link
          href={`/cookbook/${recipe.id}`}
          className="text-sm text-ink-mute hover:text-ink underline"
        >
          Cancel
        </Link>
      </div>

      {/* Basic info */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute border-b border-line pb-2">
          Basic info
        </h2>

        <div>
          <label className={labelClass}>Title</label>
          <input
            className={inputClass}
            value={recipe.title}
            onChange={(e) => updateField("title", e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={recipe.description ?? ""}
            onChange={(e) =>
              updateField("description", e.target.value || null)
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Prep time (min)</label>
            <input
              type="number"
              className={inputClass}
              value={recipe.prep_time_min ?? ""}
              onChange={(e) =>
                updateField(
                  "prep_time_min",
                  e.target.value ? Number(e.target.value) : null
                )
              }
            />
          </div>
          <div>
            <label className={labelClass}>Cook time (min)</label>
            <input
              type="number"
              className={inputClass}
              value={recipe.cook_time_min ?? ""}
              onChange={(e) =>
                updateField(
                  "cook_time_min",
                  e.target.value ? Number(e.target.value) : null
                )
              }
            />
          </div>
          <div>
            <label className={labelClass}>Total time (min)</label>
            <input
              type="number"
              className={inputClass}
              value={recipe.total_time_min ?? ""}
              onChange={(e) =>
                updateField(
                  "total_time_min",
                  e.target.value ? Number(e.target.value) : null
                )
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Servings</label>
            <input
              type="number"
              className={inputClass}
              value={recipe.servings ?? ""}
              onChange={(e) =>
                updateField(
                  "servings",
                  e.target.value ? Number(e.target.value) : null
                )
              }
            />
          </div>
          <div>
            <label className={labelClass}>Difficulty</label>
            <select
              className={inputClass}
              value={recipe.difficulty ?? ""}
              onChange={(e) =>
                updateField(
                  "difficulty",
                  (e.target.value as Recipe["difficulty"]) || null
                )
              }
            >
              <option value="">— none —</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </section>

      {/* Ingredients */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute border-b border-line pb-2">
          Ingredients
        </h2>
        {recipe.ingredients.map((ing, i) => (
          <div
            key={i}
            className="flex flex-col md:flex-row gap-2 p-3 rounded-lg bg-paper-2 border border-line"
          >
            <div className="flex-1 min-w-0">
              <label className={labelClass}>Name</label>
              <input
                className={inputClass}
                value={ing.name}
                onChange={(e) => updateIngredient(i, { name: e.target.value })}
                placeholder="e.g. olive oil"
              />
            </div>
            <div className="w-full md:w-32">
              <label className={labelClass}>Amount</label>
              <input
                className={inputClass}
                value={ing.quantity.as_written}
                onChange={(e) =>
                  updateIngredient(i, {
                    quantity: { ...ing.quantity, as_written: e.target.value },
                  })
                }
                placeholder="e.g. 2 Tbsp"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className={labelClass}>Preparation</label>
              <input
                className={inputClass}
                value={ing.preparation ?? ""}
                onChange={(e) =>
                  updateIngredient(i, {
                    preparation: e.target.value || null,
                  })
                }
                placeholder="e.g. finely chopped"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={ing.optional}
                  onChange={(e) =>
                    updateIngredient(i, { optional: e.target.checked })
                  }
                />
                Optional
              </label>
              <button
                type="button"
                onClick={() => removeIngredient(i)}
                disabled={recipe.ingredients.length <= 1}
                className="pb-2 text-ink-mute hover:text-red-500 transition-colors disabled:opacity-30"
                aria-label="Remove ingredient"
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addIngredient}
          className="self-start text-sm text-terra hover:underline"
        >
          + Add ingredient
        </button>
      </section>

      {/* Steps */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute border-b border-line pb-2">
          Steps
        </h2>
        {recipe.steps.map((step, i) => (
          <div
            key={i}
            className="flex gap-3 p-3 rounded-lg bg-paper-2 border border-line"
          >
            <span className="font-serif italic text-terra text-2xl leading-none flex-shrink-0 mt-1">
              {step.order}.
            </span>
            <div className="flex-1 flex flex-col gap-2">
              <div>
                <label className={labelClass}>Instruction</label>
                <textarea
                  className={`${inputClass} min-h-[72px] resize-y`}
                  value={step.instruction}
                  onChange={(e) =>
                    updateStep(i, { instruction: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Duration (min)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={step.duration_min ?? ""}
                    onChange={(e) =>
                      updateStep(i, {
                        duration_min: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Temperature (°F)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={step.temperature_f ?? ""}
                    onChange={(e) =>
                      updateStep(i, {
                        temperature_f: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeStep(i)}
              disabled={recipe.steps.length <= 1}
              className="text-ink-mute hover:text-red-500 transition-colors self-start mt-1 disabled:opacity-30"
              aria-label="Remove step"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addStep}
          className="self-start text-sm text-terra hover:underline"
        >
          + Add step
        </button>
      </section>

      {/* Save / Cancel */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
          {error} — please try again.
        </p>
      )}
      <div className="flex gap-3 justify-end pt-2 border-t border-line">
        <Link
          href={`/cookbook/${recipe.id}`}
          className="rounded-full border border-line bg-paper px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-terra px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#A55230] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
