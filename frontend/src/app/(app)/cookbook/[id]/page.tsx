import { notFound } from "next/navigation";
import { RecipeDetail } from "@/components/recipe/RecipeDetail";
import { getRecipe } from "@/lib/db/recipes";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const { id } = await params;

  const recipe = await getRecipe(id);

  if (!recipe) {
    notFound();
  }

  return (
    <div className="py-8 px-4 md:px-0">
      <RecipeDetail recipe={recipe} />
    </div>
  );
}
