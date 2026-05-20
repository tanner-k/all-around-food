import { notFound } from "next/navigation";
import { CookMode } from "@/components/cook/CookMode";
import type { Recipe } from "@/lib/recipe-schema";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CookPage({ params }: PageProps) {
  const { id } = await params;

  const res = await fetch(`${BACKEND_URL}/recipes/${id}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    notFound();
  }

  const recipe = (await res.json()) as Recipe;

  return (
    <div className="py-6 px-4">
      <CookMode recipe={recipe} />
    </div>
  );
}
