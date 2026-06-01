import { RecipeDetailView } from "@/components/cookbook/RecipeDetailView";

interface RecipeDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  const { id } = await params;
  return <RecipeDetailView recipeId={id} />;
}
