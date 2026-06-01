/**
 * @vitest-environment node
 *
 * Round-trip test for the Drizzle schema using an in-memory PGlite database.
 * No DATABASE_URL is required — PGlite runs entirely in-process.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Shared db instance for all tests
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  // Spin up a fresh in-memory PGlite instance
  const client = new PGlite();
  db = drizzle(client, { schema });

  // Apply the generated migrations (same SQL that runs against the real DB)
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "./migrations"),
  });
}, 30_000);

describe("schema round-trip (pglite)", () => {
  it("inserts and retrieves a recipe", async () => {
    const [recipe] = await db
      .insert(schema.recipes)
      .values({
        title: "Test Pasta",
        sourceUrl: "https://example.com/pasta",
      })
      .returning();

    expect(recipe.id).toBeTruthy();
    expect(recipe.title).toBe("Test Pasta");
    expect(recipe.sourceUrl).toBe("https://example.com/pasta");
    expect(recipe.createdAt).toBeTruthy();
  });

  it("inserts and retrieves ingredients linked to a recipe", async () => {
    const [recipe] = await db
      .insert(schema.recipes)
      .values({ title: "Ingredient Test Recipe" })
      .returning();

    await db.insert(schema.ingredients).values([
      { recipeId: recipe.id, name: "flour", amount: 250, unit: "g", position: 0 },
      { recipeId: recipe.id, name: "eggs", amount: 2, unit: null, position: 1 },
    ]);

    const rows = await db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.recipeId, recipe.id))
      .orderBy(schema.ingredients.position);

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("flour");
    expect(rows[0].amount).toBeCloseTo(250);
    expect(rows[0].unit).toBe("g");
    expect(rows[0].position).toBe(0);
    expect(rows[1].name).toBe("eggs");
    expect(rows[1].position).toBe(1);
  });

  it("inserts and retrieves steps linked to a recipe", async () => {
    const [recipe] = await db
      .insert(schema.recipes)
      .values({ title: "Steps Test Recipe" })
      .returning();

    await db.insert(schema.steps).values([
      { recipeId: recipe.id, position: 0, text: "Boil water." },
      { recipeId: recipe.id, position: 1, text: "Add pasta." },
      { recipeId: recipe.id, position: 2, text: "Drain and serve." },
    ]);

    const rows = await db
      .select()
      .from(schema.steps)
      .where(eq(schema.steps.recipeId, recipe.id))
      .orderBy(schema.steps.position);

    expect(rows).toHaveLength(3);
    expect(rows[0].text).toBe("Boil water.");
    expect(rows[1].text).toBe("Add pasta.");
    expect(rows[2].text).toBe("Drain and serve.");
  });

  it("retrieves ingredients and steps in a joined query", async () => {
    const [recipe] = await db
      .insert(schema.recipes)
      .values({ title: "Join Test Recipe" })
      .returning();

    await db.insert(schema.ingredients).values([
      { recipeId: recipe.id, name: "salt", amount: 1, unit: "tsp", position: 0 },
    ]);
    await db.insert(schema.steps).values([
      { recipeId: recipe.id, position: 0, text: "Season to taste." },
    ]);

    // Join recipes + ingredients
    const joined = await db
      .select({
        recipeTitle: schema.recipes.title,
        ingredientName: schema.ingredients.name,
      })
      .from(schema.recipes)
      .innerJoin(
        schema.ingredients,
        eq(schema.ingredients.recipeId, schema.recipes.id),
      )
      .where(eq(schema.recipes.id, recipe.id));

    expect(joined).toHaveLength(1);
    expect(joined[0].recipeTitle).toBe("Join Test Recipe");
    expect(joined[0].ingredientName).toBe("salt");
  });

  it("ON DELETE CASCADE removes ingredients and steps when recipe is deleted", async () => {
    const [recipe] = await db
      .insert(schema.recipes)
      .values({ title: "Cascade Delete Recipe" })
      .returning();

    await db.insert(schema.ingredients).values([
      { recipeId: recipe.id, name: "butter", amount: 50, unit: "g", position: 0 },
    ]);
    await db.insert(schema.steps).values([
      { recipeId: recipe.id, position: 0, text: "Melt butter." },
    ]);

    // Verify they exist before deletion
    const ingredientsBefore = await db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.recipeId, recipe.id));
    const stepsBefore = await db
      .select()
      .from(schema.steps)
      .where(eq(schema.steps.recipeId, recipe.id));
    expect(ingredientsBefore).toHaveLength(1);
    expect(stepsBefore).toHaveLength(1);

    // Delete the recipe
    await db
      .delete(schema.recipes)
      .where(eq(schema.recipes.id, recipe.id));

    // Children should be gone due to ON DELETE CASCADE
    const ingredientsAfter = await db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.recipeId, recipe.id));
    const stepsAfter = await db
      .select()
      .from(schema.steps)
      .where(eq(schema.steps.recipeId, recipe.id));

    expect(ingredientsAfter).toHaveLength(0);
    expect(stepsAfter).toHaveLength(0);
  });

  it("nullable fields accept null values", async () => {
    const [recipe] = await db
      .insert(schema.recipes)
      .values({ title: "Null Fields Recipe", sourceUrl: null })
      .returning();

    expect(recipe.sourceUrl).toBeNull();

    const [ingredient] = await db
      .insert(schema.ingredients)
      .values({
        recipeId: recipe.id,
        name: "water",
        amount: null,
        unit: null,
        notes: null,
        position: 0,
      })
      .returning();

    expect(ingredient.amount).toBeNull();
    expect(ingredient.unit).toBeNull();
    expect(ingredient.notes).toBeNull();
  });
});
