import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { shoppingListItems } from "@/db/schema";
import { shoppingItemCreateSchema } from "@/lib/schemas";
import { getCurrentUserId } from "../_lib/session";
import { eq } from "drizzle-orm";

/**
 * GET /api/shop — list all shopping list items for the current user.
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(shoppingListItems)
    .where(eq(shoppingListItems.userId, userId));

  return NextResponse.json(rows);
}

/**
 * POST /api/shop — add a shopping list item for the current user.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shoppingItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, amount, unit, recipeId } = parsed.data;

  const [item] = await db
    .insert(shoppingListItems)
    .values({
      userId,
      name,
      amount: amount ?? null,
      unit: unit ?? null,
      recipeId: recipeId ?? null,
      checked: false,
    })
    .returning();

  return NextResponse.json(item, { status: 201 });
}
