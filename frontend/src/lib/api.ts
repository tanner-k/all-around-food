// Browser-side API client. Calls the Next.js `/api/...` proxy routes (which
// forward to the FastAPI backend). Server components fetch the backend
// directly instead — see e.g. cookbook/page.tsx.

import {
  PantryItemSchema,
  type PantryItem,
  type PantryStatus,
} from "./pantry-schema";
import {
  ReceiptParseSchema,
  ShoppingListItemSchema,
  ShoppingListResponseSchema,
  type ReceiptParse,
  type ShoppingListItem,
  type ShoppingListResponse,
} from "./shopping-schema";
import {
  MealPlanSchema,
  type MealPlan,
  type PlannedMeal,
} from "./meal-plan-schema";
import { RecipeSchema, type Recipe } from "./recipe-schema";

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// ── Recipe import ─────────────────────────────────────────────────────────

const VIDEO_URL_HOST_RE =
  /(^|\.)((tiktok\.com)|(vm\.tiktok\.com)|(instagram\.com)|(instagr\.am))$/i;

export function isVideoRecipeUrl(url: string): boolean {
  try {
    return VIDEO_URL_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function parseVideoUrl(url: string): Promise<Recipe> {
  const data = await request("/api/import/parse", {
    method: "POST",
    body: JSON.stringify({ kind: "video_url", url }),
  });
  return RecipeSchema.parse(data);
}

// ── Pantry ────────────────────────────────────────────────────────────────

export async function getPantry(): Promise<PantryItem[]> {
  const data = await request("/api/pantry");
  return PantryItemSchema.array().parse(data);
}

export async function createPantryItem(name: string): Promise<PantryItem> {
  const data = await request("/api/pantry", {
    method: "POST",
    body: JSON.stringify({ id: "", name }),
  });
  return PantryItemSchema.parse(data);
}

export async function updatePantryItem(
  item: PantryItem
): Promise<PantryItem> {
  const data = await request(`/api/pantry/${item.id}`, {
    method: "PUT",
    body: JSON.stringify(item),
  });
  return PantryItemSchema.parse(data);
}

export async function setPantryItemStatus(
  id: string,
  status: PantryStatus
): Promise<PantryItem> {
  const data = await request(`/api/pantry/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return PantryItemSchema.parse(data);
}

export async function deletePantryItem(id: string): Promise<void> {
  await request(`/api/pantry/${id}`, { method: "DELETE" });
}

/** Parse a receipt image via Claude — returns items for user review. */
export async function parseReceipt(
  data: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<ReceiptParse> {
  const result = await request("/api/pantry/receipt", {
    method: "POST",
    body: JSON.stringify({ data, mediaType }),
  });
  return ReceiptParseSchema.parse(result);
}

/** Commit the user-confirmed receipt item names into the pantry. */
export async function importReceiptItems(
  names: string[]
): Promise<{ items: PantryItem[]; added: number; updated: number }> {
  const data = (await request("/api/pantry/receipt-import", {
    method: "POST",
    body: JSON.stringify({ names }),
  })) as { items: unknown; added: number; updated: number };
  return {
    items: PantryItemSchema.array().parse(data.items),
    added: data.added,
    updated: data.updated,
  };
}

// ── Shopping list ─────────────────────────────────────────────────────────

export async function getShoppingList(): Promise<ShoppingListResponse> {
  const data = await request("/api/shopping-list");
  return ShoppingListResponseSchema.parse(data);
}

export async function addShoppingItem(
  name: string,
  quantityText?: string
): Promise<ShoppingListItem> {
  const data = await request("/api/shopping-list/items", {
    method: "POST",
    body: JSON.stringify({
      id: "",
      name,
      quantity_text: quantityText ?? null,
    }),
  });
  return ShoppingListItemSchema.parse(data);
}

export async function updateShoppingItem(
  item: ShoppingListItem
): Promise<ShoppingListItem> {
  const data = await request(`/api/shopping-list/items/${item.id}`, {
    method: "PUT",
    body: JSON.stringify(item),
  });
  return ShoppingListItemSchema.parse(data);
}

export async function checkShoppingItem(
  id: string,
  checked: boolean
): Promise<ShoppingListItem> {
  const data = await request(`/api/shopping-list/items/${id}/check`, {
    method: "PATCH",
    body: JSON.stringify({ checked }),
  });
  return ShoppingListItemSchema.parse(data);
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await request(`/api/shopping-list/items/${id}`, { method: "DELETE" });
}

export async function generateShoppingList(
  recipeIds: string[]
): Promise<ShoppingListResponse> {
  const data = await request("/api/shopping-list/generate", {
    method: "POST",
    body: JSON.stringify({ recipe_ids: recipeIds }),
  });
  return ShoppingListResponseSchema.parse(data);
}

export interface ShoppingCompletionResult {
  removed: number;
  pantry_added: number;
  pantry_updated: number;
}

export async function clearCheckedShoppingItems(): Promise<ShoppingCompletionResult> {
  return (await request("/api/shopping-list/checked", {
    method: "DELETE",
  })) as ShoppingCompletionResult;
}

export async function completeShoppingList(): Promise<ShoppingCompletionResult> {
  return (await request("/api/shopping-list/complete", {
    method: "POST",
  })) as ShoppingCompletionResult;
}

export interface TextShoppingListResult {
  sent_to: string;
  item_count: number;
}

export async function textShoppingList(
  recipient: string
): Promise<TextShoppingListResult> {
  return (await request("/api/shopping-list/text", {
    method: "POST",
    body: JSON.stringify({ recipient }),
  })) as TextShoppingListResult;
}

// ── Meal plans ────────────────────────────────────────────────────────────

export async function getMealPlan(weekOf: string): Promise<MealPlan> {
  const data = await request(`/api/meal-plans/${weekOf}`);
  return MealPlanSchema.parse(data);
}

export async function saveMealPlan(
  weekOf: string,
  meals: PlannedMeal[]
): Promise<MealPlan> {
  const data = await request(`/api/meal-plans/${weekOf}`, {
    method: "PUT",
    body: JSON.stringify({ week_of: weekOf, meals }),
  });
  return MealPlanSchema.parse(data);
}
