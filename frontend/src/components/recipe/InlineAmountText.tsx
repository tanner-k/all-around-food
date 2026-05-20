import React from "react";
import type { Ingredient } from "@/lib/recipe-schema";

interface InlineAmountTextProps {
  instruction: string;
  ingredients: Ingredient[];
}

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
}: InlineAmountTextProps): React.ReactElement {
  // name (lowercased) -> amount as written
  const lookup = new Map<string, string>();
  for (const ing of ingredients) {
    const amount = ing.quantity?.as_written?.trim();
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
              <span className="ml-1 bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-[0.9em] font-medium">
                {amount}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}
