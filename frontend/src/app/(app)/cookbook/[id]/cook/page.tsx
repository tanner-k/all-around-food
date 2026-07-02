import { notFound } from "next/navigation";
import { CookMode } from "@/components/cook/CookMode";
import { getRecipe } from "@/lib/db/recipes";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CookPage({ params }: PageProps) {
  const { id } = await params;

  const recipe = await getRecipe(id);

  if (!recipe) {
    notFound();
  }

  return (
    <div className="py-6 px-4">
      <CookMode recipe={recipe} />
    </div>
  );
}
