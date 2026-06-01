import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { pantryItems } from "@/db/schema";
import { pantryItemUpdateSchema } from "@/lib/schemas";
import { getCurrentUserId } from "../../_lib/session";
import { and, eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/pantry/[id] — get one pantry item (must belong to current user).
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const item = await db.query.pantryItems.findFirst({
    where: and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)),
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

/**
 * PATCH /api/pantry/[id] — partial update of a pantry item.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await db.query.pantryItems.findFirst({
    where: and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = pantryItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, amount, unit } = parsed.data;

  const updates: Partial<{
    name: string;
    amount: number | null;
    unit: string | null;
  }> = {};
  if (name !== undefined) updates.name = name;
  if (amount !== undefined) updates.amount = amount;
  if (unit !== undefined) updates.unit = unit;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const [updated] = await db
    .update(pantryItems)
    .set(updates)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)))
    .returning();

  return NextResponse.json(updated);
}

/**
 * DELETE /api/pantry/[id] — delete a pantry item.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await db.query.pantryItems.findFirst({
    where: and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(pantryItems)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)));

  return NextResponse.json({ deleted: true });
}
