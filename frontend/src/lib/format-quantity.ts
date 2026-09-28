import type { Ingredient } from "@/lib/recipe-schema";

const FRACTIONS: ReadonlyArray<[number, string]> = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

// Abbreviations and units that read the same in the plural.
const INVARIANT_UNITS = new Set([
  "g", "kg", "mg", "ml", "l", "oz", "fl oz", "lb", "lbs", "tsp", "tbsp",
  "qt", "pt", "gal", "c", "t", "T",
]);

/** 1.5 → "1½", 0.333 → "⅓", 2 → "2"; values without a close common fraction keep up to two decimals. */
export function formatQuantityValue(value: number): string {
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest < 0.01) return String(whole);
  if (rest > 0.99) return String(whole + 1);
  const fraction = FRACTIONS.find(([amount]) => Math.abs(amount - rest) < 0.01);
  if (fraction) return whole > 0 ? `${whole}${fraction[1]}` : fraction[1];
  return String(Math.round(value * 100) / 100);
}

function formatUnit(unit: string, value: number): string {
  const trimmed = unit.trim();
  if (value <= 1 || INVARIANT_UNITS.has(trimmed) || INVARIANT_UNITS.has(trimmed.toLowerCase().replace(/\.$/, ""))) return trimmed;
  if (/[^a-z]/i.test(trimmed) || /s$/i.test(trimmed)) return trimmed;
  return /(ch|sh|x)$/i.test(trimmed) ? `${trimmed}es` : `${trimmed}s`;
}

/**
 * The amount shown in the recipe ingredient column. Parsed quantities render from
 * `value` + `unit` so the name isn't repeated; freeform or unparsed amounts
 * (`value` null, e.g. after `withEditedAmount`) fall back to `as_written`.
 */
export function formatIngredientAmount(quantity: Ingredient["quantity"]): string {
  if (quantity.value === null || !Number.isFinite(quantity.value)) return quantity.as_written.trim();
  const amount = formatQuantityValue(quantity.value);
  return quantity.unit?.trim() ? `${amount} ${formatUnit(quantity.unit, quantity.value)}` : amount;
}
