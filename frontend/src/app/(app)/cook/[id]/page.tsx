import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { recipes, steps } from "@/db/schema";
import { SectionHeader } from "@/components/SectionHeader";
import { CookView } from "@/components/cook/CookView";
import Link from "next/link";

interface CookPageProps {
  params: Promise<{ id: string }>;
}

export default async function CookPage({ params }: CookPageProps) {
  const { id } = await params;

  // Fetch recipe — db is lazy so this does not throw at build time
  const recipe = await db
    .select({ id: recipes.id, title: recipes.title })
    .from(recipes)
    .where(eq(recipes.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!recipe) {
    notFound();
  }

  // Fetch steps ordered by position ASC
  const recipeSteps = await db
    .select({
      id: steps.id,
      position: steps.position,
      text: steps.text,
    })
    .from(steps)
    .where(eq(steps.recipeId, id))
    .orderBy(asc(steps.position));

  return (
    <>
      <div className="mb-4">
        <Link
          href="/cookbook"
          className="text-sm text-ink-mute transition-colors hover:text-ink"
        >
          ← Back to Cookbook
        </Link>
      </div>

      <SectionHeader
        number="05"
        scene="COOK MODE"
        title={
          <>
            <em className="italic text-terra">{recipe.title}</em>
          </>
        }
        description="Step-by-step. Use arrow keys or tap to navigate hands-free."
      />

      <div className="mt-14">
        <CookView title={recipe.title} steps={recipeSteps} />
      </div>
    </>
  );
}
