import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { mealPlans } from "@/db/schema";
import { mealPlanCreateSchema } from "@/lib/schemas";
import { getCurrentUserId } from "../_lib/session";
import { eq } from "drizzle-orm";

/**
 * GET /api/plan — list all meal plan entries for the current user.
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(mealPlans)
    .where(eq(mealPlans.userId, userId));

  return NextResponse.json(rows);
}

/**
 * POST /api/plan — create a meal plan entry for the current user.
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

  const parsed = mealPlanCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { recipeId, scheduledFor, mealType } = parsed.data;

  const [entry] = await db
    .insert(mealPlans)
    .values({
      userId,
      recipeId,
      scheduledFor,
      mealType: mealType ?? null,
    })
    .returning();

  return NextResponse.json(entry, { status: 201 });
}
