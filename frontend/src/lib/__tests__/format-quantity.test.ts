import { describe, expect, it } from "vitest";
import { formatIngredientAmount, formatQuantityValue } from "@/lib/format-quantity";
import { withEditedAmount } from "@/lib/recipe-schema";

describe("formatQuantityValue", () => {
  it("renders whole numbers, common fractions and mixed numbers", () => {
    expect(formatQuantityValue(2)).toBe("2");
    expect(formatQuantityValue(0.5)).toBe("½");
    expect(formatQuantityValue(1 / 3)).toBe("⅓");
    expect(formatQuantityValue(0.333)).toBe("⅓");
    expect(formatQuantityValue(1.25)).toBe("1¼");
    expect(formatQuantityValue(2.999)).toBe("3");
    expect(formatQuantityValue(1.1)).toBe("1.1");
  });
});

describe("formatIngredientAmount", () => {
  it("builds the amount from value and unit so the name is not repeated", () => {
    expect(formatIngredientAmount({ value: 28, unit: "oz", as_written: "28 oz crushed tomatoes" })).toBe("28 oz");
    expect(formatIngredientAmount({ value: 2, unit: "slice", as_written: "2 slices" })).toBe("2 slices");
    expect(formatIngredientAmount({ value: 1, unit: "cup", as_written: "1 cup flour" })).toBe("1 cup");
    expect(formatIngredientAmount({ value: 1.5, unit: "cup", as_written: "1 1/2 cups" })).toBe("1½ cups");
    expect(formatIngredientAmount({ value: 2, unit: "tbsp", as_written: "2 tbsp" })).toBe("2 tbsp");
    expect(formatIngredientAmount({ value: 2, unit: "pinch", as_written: "2 pinches" })).toBe("2 pinches");
    expect(formatIngredientAmount({ value: 3, unit: null, as_written: "3 eggs" })).toBe("3");
  });

  it("falls back to as_written when the amount is unparsed or was edited freeform", () => {
    expect(formatIngredientAmount({ value: null, unit: null, as_written: " to taste " })).toBe("to taste");
    const edited = withEditedAmount({ value: 2, unit: "cup", as_written: "2 cups" }, "a big handful");
    expect(formatIngredientAmount(edited)).toBe("a big handful");
  });
});
