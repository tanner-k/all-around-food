/**
 * @vitest-environment node
 *
 * Unit tests for the typed api client (lib/api.ts).
 * All network calls are intercepted by mocking global fetch — no real server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "./api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake Response that resolves to JSON. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build an error-shaped Response (non-2xx with { error: string }). */
function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Mock fetch globally before each test
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RECIPE = {
  id: "r-1",
  title: "Test Pasta",
  sourceUrl: "https://example.com/pasta",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const RECIPE_WITH_CHILDREN = {
  ...RECIPE,
  ingredients: [
    { id: "i-1", recipeId: "r-1", name: "pasta", amount: 200, unit: "g", notes: null, position: 0 },
  ],
  steps: [
    { id: "s-1", recipeId: "r-1", position: 0, text: "Boil water." },
  ],
};

const MEAL_PLAN = {
  id: "mp-1",
  userId: "u-1",
  recipeId: "r-1",
  scheduledFor: "2026-06-02",
  mealType: "dinner",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const SHOP_ITEM = {
  id: "si-1",
  userId: "u-1",
  name: "pasta",
  amount: 200,
  unit: "g",
  checked: false,
  recipeId: "r-1",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const PANTRY_ITEM = {
  id: "pi-1",
  userId: "u-1",
  name: "flour",
  amount: 1,
  unit: "kg",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

// ===========================================================================
// ApiError
// ===========================================================================

describe("ApiError", () => {
  it("is an instance of Error", () => {
    const err = new ApiError(404, "not found");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it("has the correct name", () => {
    expect(new ApiError(500, "oops").name).toBe("ApiError");
  });

  it("exposes the HTTP status", () => {
    expect(new ApiError(422, "bad input").status).toBe(422);
  });

  it("exposes the message", () => {
    expect(new ApiError(400, "invalid").message).toBe("invalid");
  });
});

// ===========================================================================
// api.recipes
// ===========================================================================

describe("api.recipes", () => {
  describe("list()", () => {
    it("GETs /api/recipes and returns an array", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([RECIPE]));
      const result = await api.recipes.list();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/recipes",
        expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) }),
      );
      expect(result).toEqual([RECIPE]);
    });

    it("throws ApiError with server message on 401", async () => {
      fetchMock.mockResolvedValueOnce(errorResponse("Unauthorized", 401));
      await expect(api.recipes.list()).rejects.toThrow(ApiError);
      fetchMock.mockResolvedValueOnce(errorResponse("Unauthorized", 401));
      await expect(api.recipes.list()).rejects.toMatchObject({ status: 401, message: "Unauthorized" });
    });
  });

  describe("get(id)", () => {
    it("GETs /api/recipes/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(RECIPE_WITH_CHILDREN));
      const result = await api.recipes.get("r-1");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/recipes/r-1",
        expect.anything(),
      );
      expect(result.id).toBe("r-1");
      expect(result.ingredients).toHaveLength(1);
    });

    it("throws ApiError(404) when recipe not found", async () => {
      fetchMock.mockResolvedValueOnce(errorResponse("Recipe not found", 404));
      await expect(api.recipes.get("missing")).rejects.toThrow(ApiError);
      fetchMock.mockResolvedValueOnce(errorResponse("Recipe not found", 404));
      await expect(api.recipes.get("missing")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("create(data)", () => {
    it("POSTs to /api/recipes with JSON body", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(RECIPE));
      const data = { title: "Test Pasta", ingredients: [], steps: [] };
      const result = await api.recipes.create(data);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/recipes");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual(data);
      expect(result.title).toBe("Test Pasta");
    });

    it("throws ApiError(422) on validation failure", async () => {
      fetchMock.mockResolvedValueOnce(errorResponse("Validation failed", 422));
      await expect(api.recipes.create({ title: "", ingredients: [], steps: [] })).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("update(id, data)", () => {
    it("PATCHes /api/recipes/:id", async () => {
      const updated = { ...RECIPE, title: "Updated Pasta" };
      fetchMock.mockResolvedValueOnce(jsonResponse(updated));
      const result = await api.recipes.update("r-1", { title: "Updated Pasta" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/recipes/r-1");
      expect(init.method).toBe("PATCH");
      expect(result.title).toBe("Updated Pasta");
    });
  });

  describe("remove(id)", () => {
    it("DELETEs /api/recipes/:id and returns { deleted: true }", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
      const result = await api.recipes.remove("r-1");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/recipes/r-1");
      expect(init.method).toBe("DELETE");
      expect(result).toEqual({ deleted: true });
    });
  });

  describe("import(payload)", () => {
    it("POSTs to /api/recipes/import with url payload", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(RECIPE_WITH_CHILDREN));
      const payload = { url: "https://example.com/pasta" };
      const result = await api.recipes.import(payload);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/recipes/import");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual(payload);
      expect(result.ingredients).toHaveLength(1);
    });

    it("POSTs to /api/recipes/import with text payload", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(RECIPE_WITH_CHILDREN));
      const payload = { text: "1 cup flour, 2 eggs. Mix and bake." };
      await api.recipes.import(payload);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/recipes/import");
      expect(JSON.parse(init.body as string)).toEqual(payload);
    });

    it("POSTs to /api/recipes/import with imageBase64 payload", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(RECIPE_WITH_CHILDREN));
      const payload = {
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
        imageMediaType: "image/png",
      };
      await api.recipes.import(payload);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/recipes/import");
      const body = JSON.parse(init.body as string) as typeof payload;
      expect(body.imageBase64).toBe(payload.imageBase64);
      expect(body.imageMediaType).toBe("image/png");
    });

    it("throws ApiError(422) when AI cannot parse the recipe", async () => {
      fetchMock.mockResolvedValueOnce(
        errorResponse("Could not extract a recipe from that source.", 422),
      );
      await expect(
        api.recipes.import({ url: "https://example.com/not-a-recipe" }),
      ).rejects.toMatchObject({ status: 422, message: "Could not extract a recipe from that source." });
    });

    it("falls back to 'HTTP <status>' when error body is not JSON", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Service Unavailable", { status: 503 }),
      );
      const err = await api.recipes.import({ text: "anything" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(503);
      expect((err as ApiError).message).toMatch(/503/);
    });
  });
});

// ===========================================================================
// api.plan
// ===========================================================================

describe("api.plan", () => {
  describe("list()", () => {
    it("GETs /api/plan", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([MEAL_PLAN]));
      const result = await api.plan.list();
      expect(fetchMock).toHaveBeenCalledWith("/api/plan", expect.anything());
      expect(result).toHaveLength(1);
      expect(result[0].scheduledFor).toBe("2026-06-02");
    });
  });

  describe("get(id)", () => {
    it("GETs /api/plan/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(MEAL_PLAN));
      const result = await api.plan.get("mp-1");
      expect(fetchMock).toHaveBeenCalledWith("/api/plan/mp-1", expect.anything());
      expect(result.mealType).toBe("dinner");
    });
  });

  describe("create(data)", () => {
    it("POSTs to /api/plan with JSON body", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(MEAL_PLAN));
      const data = { recipeId: "r-1", scheduledFor: "2026-06-02", mealType: "dinner" as const };
      await api.plan.create(data);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/plan");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual(data);
    });
  });

  describe("update(id, data)", () => {
    it("PATCHes /api/plan/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ ...MEAL_PLAN, mealType: "lunch" }));
      const result = await api.plan.update("mp-1", { mealType: "lunch" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/plan/mp-1");
      expect(init.method).toBe("PATCH");
      expect(result.mealType).toBe("lunch");
    });
  });

  describe("remove(id)", () => {
    it("DELETEs /api/plan/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
      const result = await api.plan.remove("mp-1");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/plan/mp-1");
      expect(init.method).toBe("DELETE");
      expect(result.deleted).toBe(true);
    });

    it("throws ApiError(404) when plan entry missing", async () => {
      fetchMock.mockResolvedValueOnce(errorResponse("Not found", 404));
      await expect(api.plan.remove("missing")).rejects.toMatchObject({ status: 404 });
    });
  });
});

// ===========================================================================
// api.shop
// ===========================================================================

describe("api.shop", () => {
  describe("list()", () => {
    it("GETs /api/shop", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([SHOP_ITEM]));
      const result = await api.shop.list();
      expect(fetchMock).toHaveBeenCalledWith("/api/shop", expect.anything());
      expect(result[0].name).toBe("pasta");
    });
  });

  describe("get(id)", () => {
    it("GETs /api/shop/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SHOP_ITEM));
      const result = await api.shop.get("si-1");
      expect(fetchMock).toHaveBeenCalledWith("/api/shop/si-1", expect.anything());
      expect(result.checked).toBe(false);
    });
  });

  describe("create(data)", () => {
    it("POSTs to /api/shop", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SHOP_ITEM));
      await api.shop.create({ name: "pasta" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/shop");
      expect(init.method).toBe("POST");
    });
  });

  describe("update(id, data)", () => {
    it("PATCHes /api/shop/:id (toggle checked)", async () => {
      const updated = { ...SHOP_ITEM, checked: true };
      fetchMock.mockResolvedValueOnce(jsonResponse(updated));
      const result = await api.shop.update("si-1", { checked: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/shop/si-1");
      expect(init.method).toBe("PATCH");
      expect(result.checked).toBe(true);
    });
  });

  describe("remove(id)", () => {
    it("DELETEs /api/shop/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
      const result = await api.shop.remove("si-1");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/shop/si-1");
      expect(init.method).toBe("DELETE");
      expect(result.deleted).toBe(true);
    });
  });
});

// ===========================================================================
// api.pantry
// ===========================================================================

describe("api.pantry", () => {
  describe("list()", () => {
    it("GETs /api/pantry", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([PANTRY_ITEM]));
      const result = await api.pantry.list();
      expect(fetchMock).toHaveBeenCalledWith("/api/pantry", expect.anything());
      expect(result[0].name).toBe("flour");
    });
  });

  describe("get(id)", () => {
    it("GETs /api/pantry/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(PANTRY_ITEM));
      const result = await api.pantry.get("pi-1");
      expect(fetchMock).toHaveBeenCalledWith("/api/pantry/pi-1", expect.anything());
      expect(result.unit).toBe("kg");
    });
  });

  describe("create(data)", () => {
    it("POSTs to /api/pantry with JSON body", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(PANTRY_ITEM));
      await api.pantry.create({ name: "flour", amount: 1, unit: "kg" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/pantry");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ name: "flour", amount: 1, unit: "kg" });
    });
  });

  describe("update(id, data)", () => {
    it("PATCHes /api/pantry/:id", async () => {
      const updated = { ...PANTRY_ITEM, amount: 0.5 };
      fetchMock.mockResolvedValueOnce(jsonResponse(updated));
      const result = await api.pantry.update("pi-1", { amount: 0.5 });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/pantry/pi-1");
      expect(init.method).toBe("PATCH");
      expect(result.amount).toBe(0.5);
    });
  });

  describe("remove(id)", () => {
    it("DELETEs /api/pantry/:id", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));
      const result = await api.pantry.remove("pi-1");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/pantry/pi-1");
      expect(init.method).toBe("DELETE");
      expect(result.deleted).toBe(true);
    });
  });
});

// ===========================================================================
// Non-2xx error handling — generic behaviours
// ===========================================================================

describe("non-2xx error handling", () => {
  it("uses server error message when body has { error: string }", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse("You are not authorised.", 403));
    const err = await api.recipes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("You are not authorised.");
    expect((err as ApiError).status).toBe(403);
  });

  it("falls back to 'HTTP <status>' when body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );
    const err = await api.recipes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toMatch(/500/);
  });

  it("falls back to 'HTTP <status>' when body JSON has no 'error' key", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "oops" }), { status: 500 }),
    );
    const err = await api.recipes.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/500/);
  });

  it("includes Content-Type: application/json header on all requests", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await api.recipes.list();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
