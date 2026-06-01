/**
 * Typed API client — the single place all components call to reach the server.
 *
 * Rules:
 * - No server-only imports (no db, no env, no server actions).
 * - Uses relative URLs so it works in both client and server components.
 * - Throws a typed ApiError on non-2xx responses, preserving the server
 *   error message so callers can surface it to the user.
 */

import type {
  RecipeCreate,
  RecipeUpdate,
  MealPlanCreate,
  MealPlanUpdate,
  ShoppingItemCreate,
  ShoppingItemUpdate,
  PantryItemCreate,
  PantryItemUpdate,
} from "./schemas";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // ignore parse errors — use the default message
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Inferred DB types (mirrors what the route handlers return)
// ---------------------------------------------------------------------------

export interface Recipe {
  id: string;
  title: string;
  sourceUrl: string | null;
  createdAt: string | null;
  ingredients?: RecipeIngredient[];
  steps?: RecipeStep[];
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  name: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
  position: number;
}

export interface RecipeStep {
  id: string;
  recipeId: string;
  position: number;
  text: string;
}

export interface MealPlan {
  id: string;
  userId: string;
  recipeId: string;
  scheduledFor: string;
  mealType: string | null;
  createdAt: string | null;
}

export interface ShoppingItem {
  id: string;
  userId: string;
  name: string;
  amount: number | null;
  unit: string | null;
  checked: boolean;
  recipeId: string | null;
  createdAt: string | null;
}

export interface PantryItem {
  id: string;
  userId: string;
  name: string;
  amount: number | null;
  unit: string | null;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Resource clients
// ---------------------------------------------------------------------------

const recipes = {
  list(): Promise<Recipe[]> {
    return apiFetch<Recipe[]>("/api/recipes");
  },
  get(id: string): Promise<Recipe> {
    return apiFetch<Recipe>(`/api/recipes/${id}`);
  },
  create(data: RecipeCreate): Promise<Recipe> {
    return apiFetch<Recipe>("/api/recipes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  update(id: string, data: RecipeUpdate): Promise<Recipe> {
    return apiFetch<Recipe>(`/api/recipes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  remove(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/api/recipes/${id}`, {
      method: "DELETE",
    });
  },
};

const plan = {
  list(): Promise<MealPlan[]> {
    return apiFetch<MealPlan[]>("/api/plan");
  },
  get(id: string): Promise<MealPlan> {
    return apiFetch<MealPlan>(`/api/plan/${id}`);
  },
  create(data: MealPlanCreate): Promise<MealPlan> {
    return apiFetch<MealPlan>("/api/plan", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  update(id: string, data: MealPlanUpdate): Promise<MealPlan> {
    return apiFetch<MealPlan>(`/api/plan/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  remove(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/api/plan/${id}`, {
      method: "DELETE",
    });
  },
};

const shop = {
  list(): Promise<ShoppingItem[]> {
    return apiFetch<ShoppingItem[]>("/api/shop");
  },
  get(id: string): Promise<ShoppingItem> {
    return apiFetch<ShoppingItem>(`/api/shop/${id}`);
  },
  create(data: ShoppingItemCreate): Promise<ShoppingItem> {
    return apiFetch<ShoppingItem>("/api/shop", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  update(id: string, data: ShoppingItemUpdate): Promise<ShoppingItem> {
    return apiFetch<ShoppingItem>(`/api/shop/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  remove(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/api/shop/${id}`, {
      method: "DELETE",
    });
  },
};

const pantry = {
  list(): Promise<PantryItem[]> {
    return apiFetch<PantryItem[]>("/api/pantry");
  },
  get(id: string): Promise<PantryItem> {
    return apiFetch<PantryItem>(`/api/pantry/${id}`);
  },
  create(data: PantryItemCreate): Promise<PantryItem> {
    return apiFetch<PantryItem>("/api/pantry", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  update(id: string, data: PantryItemUpdate): Promise<PantryItem> {
    return apiFetch<PantryItem>(`/api/pantry/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  remove(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/api/pantry/${id}`, {
      method: "DELETE",
    });
  },
};

// ---------------------------------------------------------------------------
// Unified export
// ---------------------------------------------------------------------------

export const api = { recipes, plan, shop, pantry };
