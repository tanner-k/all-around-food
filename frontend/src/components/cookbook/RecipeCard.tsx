"use client";

import Link from "next/link";
import type { Recipe } from "@/lib/api";

// Warm gradient palettes for recipe cards (no images in v1)
const gradients = [
  "from-[#F4C9A5] to-[#D67D52]", // salmon
  "from-[#F5DDA8] to-[#C68B40]", // pasta/golden
  "from-[#C7DAB0] to-[#6E8D54]", // salad/green
  "from-[#F8E6BB] to-[#E0A45A]", // eggs/warm
  "from-[#EBD3AA] to-[#B58456]", // chicken/tan
  "from-[#E8AE7C] to-[#B14A2C]", // tikka/orange
  "from-[#F1B69A] to-[#C24B2A]", // soup/red
  "from-[#E8DABE] to-[#A88A55]", // rice/beige
  "from-[#F4D8B5] to-[#C68056]", // gnocchi/amber
  "from-[#E2D6C2] to-[#C7B89C]", // default/neutral
];

function getGradient(id: string): string {
  // Stable gradient from recipe id
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % gradients.length;
  }
  return gradients[hash] ?? gradients[0]!;
}

interface RecipeCardProps {
  recipe: Recipe;
  isNew?: boolean;
}

export function RecipeCard({ recipe, isNew = false }: RecipeCardProps) {
  const gradient = getGradient(recipe.id);

  return (
    <div
      className={[
        "group rounded-[10px] border bg-paper overflow-hidden flex flex-col transition-shadow hover:shadow-md",
        isNew ? "border-terra border-2" : "border-line",
      ].join(" ")}
    >
      {/* Photo placeholder */}
      <div
        className={`aspect-[4/3] bg-gradient-to-br ${gradient}`}
      />

      {/* Meta */}
      <div className="px-2.5 py-2 flex flex-col gap-0.5">
        <p className="font-serif text-sm leading-tight text-ink">{recipe.title}</p>
        {isNew ? (
          <p className="text-[10px] text-terra font-medium">just added</p>
        ) : recipe.createdAt ? (
          <p className="text-[10px] text-ink-mute">
            {new Date(recipe.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        ) : null}
      </div>

      {/* Actions row — visible on hover */}
      <div className="px-2.5 pb-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/cook/${recipe.id}`}
          className="flex-1 text-center rounded-full bg-terra text-paper text-[10px] font-semibold py-1 transition-colors hover:bg-terra/90"
        >
          Cook
        </Link>
        <Link
          href={`/cookbook/${recipe.id}`}
          className="flex-1 text-center rounded-full bg-paper-2 text-ink text-[10px] font-semibold py-1 border border-line transition-colors hover:bg-line"
        >
          Details
        </Link>
      </div>
    </div>
  );
}
