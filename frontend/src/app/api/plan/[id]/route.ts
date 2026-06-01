import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { mealPlans } from "@/db/schema";
import { mealPlanUpdateSchema } from "@/lib/schemas";
import { getCurrentUserId } from "../../_lib/session";
import { and, eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/plan/[id] — get one meal plan entry (must belong to current user).
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const entry = await db.query.mealPlans.findFirst({
    where: and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)),
  });

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(entry);
}

/**
 * PATCH /api/plan/[id] — partial update of a meal plan entry.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await db.query.mealPlans.findFirst({
    where: and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)),
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

  const parsed = mealPlanUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { recipeId, scheduledFor, mealType } = parsed.data;

  const updates: Partial<{
    recipeId: string;
    scheduledFor: string;
    mealType: string | null;
  }> = {};
  if (recipeId !== undefined) updates.recipeId = recipeId;
  if (scheduledFor !== undefined) updates.scheduledFor = scheduledFor;
  if (mealType !== undefined) updates.mealType = mealType;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const [updated] = await db
    .update(mealPlans)
    .set(updates)
    .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)))
    .returning();

  return NextResponse.json(updated);
}

/**
 * DELETE /api/plan/[id] — delete a meal plan entry.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await db.query.mealPlans.findFirst({
    where: and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(mealPlans)
    .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)));

  return NextResponse.json({ deleted: true });
}
