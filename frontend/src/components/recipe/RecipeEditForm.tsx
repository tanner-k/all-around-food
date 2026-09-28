"use client";

import { useState } from "react";
import { withEditedAmount, type Recipe, type Ingredient, type Step } from "@/lib/recipe-schema";
import { localHref } from "@/lib/local/navigation";
import { ChevronDown, X } from "lucide-react";
import { eyebrow } from "@/lib/typography";
import { CheckboxButton } from "@/components/CheckboxButton";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

interface RecipeEditFormProps {
  recipe: Recipe;
  onSave: (recipe: Recipe, expected?: Recipe | null) => Promise<void>;
  isNew?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink placeholder-ink-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors";

const selectClass = `${inputClass} appearance-none pr-10`;

const labelClass = `${eyebrow} block mb-1`;

const sectionHeadingClass = `${eyebrow} border-b border-line pb-2`;

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

export function RecipeEditForm({ recipe: initialRecipe, onSave, isNew = false }: RecipeEditFormProps) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [baseline] = useState(() => isNew ? null : initialRecipe);
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
    if (!recipe.title.trim() || !recipe.ingredients.some((item) => item.name.trim()) || !recipe.steps.some((step) => step.instruction.trim())) {
      setError("Add a title, an ingredient, and a step before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...recipe, ingredients: recipe.ingredients.filter((item) => item.name.trim()), steps: recipe.steps.filter((step) => step.instruction.trim()).map((step, index) => ({...step, order: index + 1})) }, baseline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl text-ink leading-tight">
          {isNew ? "New recipe" : "Edit recipe"}
        </h1>
        <a
          href={isNew ? localHref("cookbook") : localHref("recipe", recipe.id)}
          className="text-sm text-ink-mute hover:text-ink underline"
        >
          Cancel
        </a>
      </div>

      {/* Basic info */}
      <section className="flex flex-col gap-4">
        <h2 className={sectionHeadingClass}>
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
            <div className="relative">
              <select
                className={selectClass}
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
              <ChevronDown
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Ingredients */}
      <section className="flex flex-col gap-3">
        <h2 className={sectionHeadingClass}>
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
                    quantity: withEditedAmount(ing.quantity, e.target.value),
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
              <label className="flex items-center text-xs text-ink-soft cursor-pointer">
                <CheckboxButton
                  size="sm"
                  aria-label={`Optional: ${ing.name.trim() || `ingredient ${i + 1}`}`}
                  checked={ing.optional}
                  onChange={(next) => updateIngredient(i, { optional: next })}
                />
                <span>Optional</span>
              </label>
              <IconButton
                aria-label="Remove ingredient"
                icon={<X size={18} />}
                onClick={() => removeIngredient(i)}
                disabled={recipe.ingredients.length <= 1}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addIngredient}
          className="self-start text-sm text-terra-strong hover:underline"
        >
          + Add ingredient
        </button>
      </section>

      {/* Steps */}
      <section className="flex flex-col gap-3">
        <h2 className={sectionHeadingClass}>
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
            <IconButton
              aria-label="Remove step"
              icon={<X size={18} />}
              onClick={() => removeStep(i)}
              disabled={recipe.steps.length <= 1}
              className="self-start"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addStep}
          className="self-start text-sm text-terra-strong hover:underline"
        >
          + Add step
        </button>
      </section>

      {/* Save / Cancel */}
      {error && (
        <p className="text-sm text-danger bg-danger-soft rounded-lg px-4 py-2">
          {error} — please try again.
        </p>
      )}
      <div className="flex gap-3 justify-end pt-2 border-t border-line">
        <Button
          variant="secondary"
          href={isNew ? localHref("cookbook") : localHref("recipe", recipe.id)}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
