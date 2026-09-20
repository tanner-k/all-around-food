"use server";

import { revalidatePath } from "next/cache";
import {
  addPantryItem,
  listPantryItems,
  updatePantryStatus,
  updatePantryItem,
  deletePantryItem,
  type PantryItemPatch,
} from "@/lib/db/pantry";
import { type PantryItem, type PantryStatus } from "@/lib/pantry-schema";

type ActionError = { error: string };
type ActionResult = { ok: true } | ActionError;
type ActionResultWith<T> = ({ ok: true } & T) | ActionError;

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

/**
 * Revalidate routes affected by a pantry change. `/shop` is included because
 * pantry stock status feeds the shopping list's "already have it" flags; the
 * shopping vertical itself is untouched by this module.
 */
function revalidatePantry(): void {
  revalidatePath("/pantry");
  revalidatePath("/shop");
}

/** Read pantry items for client flows that need a fresh snapshot. */
export async function listPantryItemsAction(): Promise<
  ActionResultWith<{ items: PantryItem[] }>
> {
  try {
    return { ok: true, items: await listPantryItems() };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Add an item to the pantry. Returns the created item so the UI can append it. */
export async function addPantryItemAction(
  name: string,
): Promise<ActionResultWith<{ item: PantryItem }>> {
  try {
    const item = await addPantryItem(name);
    revalidatePantry();
    return { ok: true, item };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Change an item's stock status. */
export async function updatePantryStatusAction(
  id: string,
  status: PantryStatus,
): Promise<ActionResult> {
  try {
    await updatePantryStatus(id, status);
    revalidatePantry();
    return { ok: true };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Edit an item's name / aisle / notes. */
export async function updatePantryItemAction(
  id: string,
  patch: PantryItemPatch,
): Promise<ActionResultWith<{ item: PantryItem }>> {
  try {
    const item = await updatePantryItem(id, patch);
    revalidatePantry();
    return { ok: true, item };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Remove an item from the pantry. */
export async function deletePantryItemAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deletePantryItem(id);
    revalidatePantry();
    return { ok: true };
  } catch (err) {
    return { error: message(err) };
  }
}
