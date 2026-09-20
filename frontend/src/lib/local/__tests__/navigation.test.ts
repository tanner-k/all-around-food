import { describe, expect, it } from "vitest";
import { localHref, parseLocalRoute } from "../navigation";

describe("local navigation", () => {
  it("round trips encoded recipe IDs and manual entry", () => {
    expect(parseLocalRoute(localHref("recipe", "a/b ?#é").slice(4))).toEqual({ view: "recipe", recipeId: "a/b ?#é" });
    expect(parseLocalRoute("#/cookbook/new")).toEqual({ view: "edit", recipeId: null });
    expect(localHref("edit")).toBe("/app#/cookbook/new");
    expect(parseLocalRoute(localHref("recipe", "new").slice(4))).toEqual({ view: "recipe", recipeId: "new" });
  });

  it("handles unknown paths and malformed URI encoding without throwing", () => {
    expect(parseLocalRoute("#/cookbook/%ZZ")).toEqual({ view: "cookbook" });
    expect(parseLocalRoute("#/not-a-route")).toEqual({ view: "plan" });
  });

  it("parses every shell view and optional plan week", () => {
    expect(parseLocalRoute("#/plan?weekOf=2026-09-21")).toEqual({ view: "plan", weekOf: "2026-09-21" });
    expect(parseLocalRoute("#/cookbook/id/edit")).toEqual({ view: "edit", recipeId: "id" });
    expect(parseLocalRoute("#/cookbook/id/cook")).toEqual({ view: "cook", recipeId: "id" });
    for (const view of ["cookbook", "shop", "pantry", "import", "settings"] as const) {
      expect(parseLocalRoute(localHref(view).slice(4))).toEqual({ view });
    }
  });
});
