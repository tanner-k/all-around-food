import { notFound } from "next/navigation";
import { RecipeDetail } from "@/components/recipe/RecipeDetail";
import { BACKEND_URL } from "@/lib/backend-url";
import type { Recipe } from "@/lib/recipe-schema";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const { id } = await params;

  const res = await fetch(`${BACKEND_URL}/recipes/${id}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    notFound();
  }

  const recipe = (await res.json()) as Recipe;

  return (
    <div className="py-8 px-4 md:px-0">
      <RecipeDetail recipe={recipe} />
    </div>
  );
}
