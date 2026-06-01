/**
 * Seed script — inserts one sample recipe with ingredients and steps.
 *
 * Usage (run manually, not during build or CI):
 *   DATABASE_URL=<connection-string> npx tsx src/db/seed.ts
 *
 * This script is intentionally standalone: it imports the schema directly
 * and creates its own db connection rather than relying on client.ts so it
 * can be run as a one-off CLI script.
 */

import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";
import * as schema from "./schema";

const db = drizzle(sql, { schema });

async function main() {
  console.log("Seeding database...");

  // Insert a sample recipe
  const [recipe] = await db
    .insert(schema.recipes)
    .values({
      title: "Classic Marinara Pasta",
      sourceUrl: "https://example.com/marinara-pasta",
    })
    .returning();

  console.log(`Inserted recipe: ${recipe.id} — ${recipe.title}`);

  // Insert ingredients
  await db.insert(schema.ingredients).values([
    {
      recipeId: recipe.id,
      name: "spaghetti",
      amount: 400,
      unit: "g",
      notes: null,
      position: 0,
    },
    {
      recipeId: recipe.id,
      name: "crushed tomatoes",
      amount: 400,
      unit: "g",
      notes: "one 400 g tin",
      position: 1,
    },
    {
      recipeId: recipe.id,
      name: "garlic cloves",
      amount: 3,
      unit: null,
      notes: "thinly sliced",
      position: 2,
    },
    {
      recipeId: recipe.id,
      name: "olive oil",
      amount: 3,
      unit: "tbsp",
      notes: null,
      position: 3,
    },
    {
      recipeId: recipe.id,
      name: "fresh basil",
      amount: null,
      unit: null,
      notes: "handful, torn",
      position: 4,
    },
  ]);

  console.log("Inserted 5 ingredients");

  // Insert steps
  await db.insert(schema.steps).values([
    {
      recipeId: recipe.id,
      position: 0,
      text: "Bring a large pot of salted water to a boil.",
    },
    {
      recipeId: recipe.id,
      position: 1,
      text: "Heat olive oil in a wide pan over medium heat. Add garlic and cook until fragrant, about 1 minute.",
    },
    {
      recipeId: recipe.id,
      position: 2,
      text: "Add crushed tomatoes and simmer for 15 minutes, stirring occasionally.",
    },
    {
      recipeId: recipe.id,
      position: 3,
      text: "Cook spaghetti according to package directions until al dente. Reserve ½ cup pasta water.",
    },
    {
      recipeId: recipe.id,
      position: 4,
      text: "Toss pasta in the sauce, adding pasta water as needed to loosen. Top with fresh basil.",
    },
  ]);

  console.log("Inserted 5 steps");
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
