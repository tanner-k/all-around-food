import React from "react";
import type { Ingredient } from "@/lib/recipe-schema";
import { formatIngredientAmount } from "@/lib/format-quantity";

interface InlineAmountTextProps {
  instruction: string;
  ingredients: Ingredient[];
  /**
   * `chip` (default) is the filled pill used by cook mode and review. `inline` is a
   * lighter running-text annotation for recipe detail, where the ingredient list
   * already carries the amounts; parsed amounts drop the repeated name
   * ("garlic 4 cloves", not "garlic 4 cloves garlic").
   */
  variant?: "chip" | "inline";
}

const amountClasses = {
  chip: "ml-1 bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-[0.9em] font-medium",
  inline: "ml-1 text-terra font-medium tabular-nums",
} as const;

/**
 * Renders an instruction string with each referenced ingredient followed by
 * an inline `.amt` pill showing its quantity — the app's signature
 * "amounts inline with steps" treatment.
 *
 * Ingredient names are matched case-insensitively on word boundaries;
 * longer names are tried first so "all-purpose flour" wins over "flour".
 */
export function InlineAmountText({
  instruction,
  ingredients,
  variant = "chip",
}: InlineAmountTextProps): React.ReactElement {
  // name (lowercased) -> amount to show
  const lookup = new Map<string, string>();
  for (const ing of ingredients) {
    const amount = ing.quantity
      ? variant === "inline"
        ? formatIngredientAmount(ing.quantity)
        : ing.quantity.as_written?.trim()
      : undefined;
    if (ing.name && amount) {
      lookup.set(ing.name.toLowerCase(), amount);
    }
  }

  if (lookup.size === 0) {
    return <>{instruction}</>;
  }

  // Longest names first so longer phrases win over their substrings.
  const names = [...lookup.keys()].sort((a, b) => b.length - a.length);
  const escaped = names.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  const parts = instruction.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        // Even indices are plain text; odd indices are matched names.
        if (i % 2 === 0) return part;
        const amount = lookup.get(part.toLowerCase());
        return (
          <span key={i} className="whitespace-nowrap">
            {part}
            {amount && (
              <span className={amountClasses[variant]}>
                {amount}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}
