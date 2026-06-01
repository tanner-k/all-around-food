import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { pantryItems } from "@/db/schema";
import { pantryItemCreateSchema } from "@/lib/schemas";
import { getCurrentUserId } from "../_lib/session";
import { eq } from "drizzle-orm";

/**
 * GET /api/pantry — list all pantry items for the current user.
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(pantryItems)
    .where(eq(pantryItems.userId, userId));

  return NextResponse.json(rows);
}

/**
 * POST /api/pantry — add a pantry item for the current user.
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

  const parsed = pantryItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, amount, unit } = parsed.data;

  const [item] = await db
    .insert(pantryItems)
    .values({
      userId,
      name,
      amount: amount ?? null,
      unit: unit ?? null,
    })
    .returning();

  return NextResponse.json(item, { status: 201 });
}
