import { beforeEach, describe, expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { GET } from "./route";

type Row = Record<string, unknown>;
const tables = ["recipes", "meal_plans", "planned_meals", "pantry_items", "shopping_list_items"];

function mockClient(rows: Record<string, Row[]> = {}, userId: string | null = "owner-1", ownerId: string | null = "owner-1") {
  const ranges: { table: string; start: number; end: number }[] = [];
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null }, error: null })) },
    rpc: vi.fn(async () => ({ data: ownerId, error: null })),
    from: vi.fn((table: string) => ({
      select: (columns: string) => {
        expect(columns).toBe("*");
        return { order: (column: string, options: { ascending: boolean }) => {
          expect(column).toBe("id");
          expect(options).toEqual({ ascending: true });
          return { range: async (start: number, end: number) => {
            ranges.push({ table, start, end });
            return { data: (rows[table] ?? []).slice(start, end + 1), error: null };
          } };
        } };
      },
    })),
  };
  createClient.mockResolvedValue(client);
  return { client, ranges };
}

beforeEach(() => {
  createClient.mockReset();
});

describe("GET /api/export", () => {
  it("requires a signed-in owner and never reads tables for other users", async () => {
    const signedOut = mockClient({}, null);
    const unauthorized = await GET();
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");
    expect(signedOut.client.rpc).not.toHaveBeenCalled();
    expect(signedOut.client.from).not.toHaveBeenCalled();

    const nonOwner = mockClient({}, "other-user");
    const forbidden = await GET();
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("Cache-Control")).toBe("no-store");
    expect(nonOwner.client.rpc).toHaveBeenCalledWith("import_owner_uid");
    expect(nonOwner.client.from).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenCalledWith();
  });

  it("paginates beyond 500 rows and joins canonical plan, pantry, and shopping fields", async () => {
    const recipes = Array.from({ length: 501 }, (_, index) => ({
      ...recipeFixture(), id: `recipe-${index}`, title: `Toast ${index}`, legacy_only: "discard me",
    }));
    const pantry = { id: "pantry-1", name: "bread", status: "low", aisle: "Bakery", aisle_overridden: false, notes: null, created_at: "2026-09-20T12:00:00Z", updated_at: "2026-09-20T12:00:00Z", legacy_only: "discard me" };
    const shopping = { id: "shop-1", name: "bread", quantity_text: "one loaf", aisle: "Bakery", checked: true, source: "recipe", source_recipe_id: "recipe-500", generated_week_of: "2026-09-21", pantry_covered: false, pantry_low: true, created_at: "2026-09-20T12:00:00Z" };
    const { client, ranges } = mockClient({
      recipes,
      meal_plans: [{ id: "2026-09-21", week_of: "2026-09-21", updated_at: "2026-09-20T12:00:00Z" }],
      planned_meals: [{ id: "meal-1", meal_plan_id: "2026-09-21", day_index: 3, recipe_id: "recipe-500" }],
      pantry_items: [pantry], shopping_list_items: [shopping],
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect([...new Set(client.from.mock.calls.map(([table]) => table))]).toEqual(tables);
    expect(ranges.filter(({ table }) => table === "recipes")).toEqual([
      { table: "recipes", start: 0, end: 499 },
      { table: "recipes", start: 500, end: 999 },
    ]);
    const backup = await response.json();
    expect(backup.library.recipes).toHaveLength(501);
    expect(backup.library.recipes[500]).toMatchObject({ id: "recipe-500", title: "Toast 500" });
    expect(backup.library.recipes[500]).not.toHaveProperty("legacy_only");
    expect(backup.library.meal_plans).toEqual([{ week_of: "2026-09-21", updated_at: "2026-09-20T12:00:00Z", meals: [{ day_index: 3, recipe_id: "recipe-500", servings: null }] }]);
    expect(backup.library.pantry[0]).toMatchObject({ id: "pantry-1", name: "bread", status: "low", aisle: "Bakery" });
    expect(backup.library.pantry[0]).not.toHaveProperty("legacy_only");
    expect(backup.library.shopping).toEqual([shopping]);
  });

  it("reports orphan plan and recipe references rather than silently dropping rows", async () => {
    mockClient({ planned_meals: [{ id: "orphan-1", meal_plan_id: "missing-plan", day_index: 0, recipe_id: "missing-recipe" }] });
    const response = await GET();
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.validation_errors).toEqual([
      expect.stringMatching(/orphan-1.*no plan header missing-plan/),
      expect.stringMatching(/orphan-1.*missing recipe missing-recipe/),
    ]);
    expect(body).not.toHaveProperty("library");
  });
});
