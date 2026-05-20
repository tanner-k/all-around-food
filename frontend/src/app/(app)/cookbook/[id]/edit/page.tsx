import { notFound } from "next/navigation";
import { RecipeEditForm } from "@/components/recipe/RecipeEditForm";
import type { Recipe } from "@/lib/recipe-schema";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditRecipePage({ params }: PageProps) {
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
      <RecipeEditForm recipe={recipe} />
    </div>
  );
}
