"use server";

import { revalidatePath } from "next/cache";
import {
  addFromRecipes,
  addManualItem,
  clearChecked,
  completeShopping,
  getShoppingList,
  listRecipeOptions,
  removeItem,
  toggleChecked,
  type RecipeOption,
  type ShoppingCompletionResult,
} from "@/lib/db/shopping";
import type {
  ShoppingListItem,
  ShoppingListResponse,
} from "@/lib/shopping-schema";

type ActionOk<T> = { ok: true; data: T };
type ActionErr = { ok: false; error: string };
export type ActionResult<T> = ActionOk<T> | ActionErr;

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

function ok<T>(data: T): ActionOk<T> {
  return { ok: true, data };
}

function fail(err: unknown): ActionErr {
  return { ok: false, error: message(err) };
}

/** Re-read the current grouped shopping list (used by the client to refresh). */
export async function getShoppingListAction(): Promise<
  ActionResult<ShoppingListResponse>
> {
  try {
    return ok(await getShoppingList());
  } catch (err) {
    return fail(err);
  }
}

/** Recipe options for the "add from recipes" picker. */
export async function listRecipeOptionsAction(): Promise<
  ActionResult<RecipeOption[]>
> {
  try {
    return ok(await listRecipeOptions());
  } catch (err) {
    return fail(err);
  }
}

/** Add a manual item. */
export async function addManualItemAction(
  name: string,
  quantityText?: string,
): Promise<ActionResult<ShoppingListItem>> {
  try {
    const item = await addManualItem(name, quantityText);
    revalidatePath("/shop");
    return ok(item);
  } catch (err) {
    return fail(err);
  }
}

/** Toggle a single item's checked state. */
export async function toggleCheckedAction(
  id: string,
  checked: boolean,
): Promise<ActionResult<ShoppingListItem>> {
  try {
    const item = await toggleChecked(id, checked);
    revalidatePath("/shop");
    return ok(item);
  } catch (err) {
    return fail(err);
  }
}

/** Delete a single item. */
export async function removeItemAction(
  id: string,
): Promise<ActionResult<null>> {
  try {
    await removeItem(id);
    revalidatePath("/shop");
    return ok(null);
  } catch (err) {
    return fail(err);
  }
}

/** Mark checked items as bought (stock into pantry, then remove). */
export async function clearCheckedAction(): Promise<
  ActionResult<ShoppingCompletionResult>
> {
  try {
    const result = await clearChecked();
    revalidatePath("/shop");
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

/** Complete the whole list (stock every item into pantry, then clear). */
export async function completeShoppingAction(): Promise<
  ActionResult<ShoppingCompletionResult>
> {
  try {
    const result = await completeShopping();
    revalidatePath("/shop");
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}

/** Generate recipe-sourced items from the selected recipes. */
export async function addFromRecipesAction(
  recipeIds: string[],
): Promise<ActionResult<ShoppingListResponse>> {
  try {
    const list = await addFromRecipes(recipeIds);
    revalidatePath("/shop");
    return ok(list);
  } catch (err) {
    return fail(err);
  }
}
