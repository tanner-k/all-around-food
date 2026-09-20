"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { RecipeDetail } from "@/components/recipe/RecipeDetail";
import { RecipeEditForm } from "@/components/recipe/RecipeEditForm";
import { CookMode } from "@/components/cook/CookMode";
import { DataSettings } from "@/components/settings/DataSettings";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { localHref, type LocalRoute } from "@/lib/local/navigation";
import { beginCookSession, completeCookSession, putRecipe, saveCookProgress, setPantryStatus } from "@/lib/local/repository";
import type { LibrarySnapshot } from "@/lib/local/schema";

function blankRecipe(): Recipe {
  return RecipeSchema.parse({
    id: crypto.randomUUID(), title: "", description: null, source_url: null,
    source_attribution: null, prep_time_min: null, cook_time_min: null,
    total_time_min: null, servings: null, yield_text: null,
    ingredients: [{ name: "", quantity: { value: null, unit: null, as_written: "" }, preparation: null, optional: false, group: null, notes: null }],
    steps: [{ order: 1, instruction: "", duration_min: null, temperature_f: null, equipment: [], inline_amounts: [] }],
    equipment: [], cuisine: null, course: null, dietary_tags: [], difficulty: null,
    nutrition: null, notes: null, storage_instructions: null,
    created_at: new Date().toISOString(), times_made: 0, parse_confidence: null,
  });
}

function MissingRecipe() {
  return <div className="mx-auto max-w-xl rounded-2xl border border-line bg-paper p-8 text-center">
    <h1 className="font-serif text-3xl text-ink">Recipe unavailable</h1>
    <p className="mt-3 text-ink-mute">This recipe is not in your local cookbook.</p>
    <a className="mt-5 inline-block text-terra underline" href={localHref("cookbook")}>Back to cookbook</a>
  </div>;
}

export function LocalScreens({ route, snapshot }: { route: LocalRoute; snapshot: LibrarySnapshot }) {
  const [manualRecipe] = useState(blankRecipe);
  const recipe = "recipeId" in route ? snapshot.recipes.find((item) => item.id === route.recipeId) : undefined;
  const progress = recipe ? snapshot.cook_progress.find((item) => item.recipe_id === recipe.id) : undefined;

  useEffect(() => {
    if (route.view === "cook" && recipe && (!progress || !progress.session_id)) {
      void beginCookSession(recipe.id);
    }
  }, [route.view, recipe, progress]);

  if (route.view === "settings") return <DataSettings />;

  if (route.view === "cookbook") {
    const recipes = [...snapshot.recipes].sort((a, b) => b.times_made - a.times_made || b.created_at.localeCompare(a.created_at));
    return <>
      <SectionHeader number="02" scene="YOUR LIBRARY" title={<>Every recipe you&apos;ve <em className="italic text-terra">saved</em>.</>} description="Sorted by what you cook most." />
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={localHref("edit")} className="rounded-full bg-terra px-5 py-2.5 text-sm font-semibold text-white">+ Add recipe</a>
        <a href={localHref("import")} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Import recipe</a>
      </div>
      {recipes.length === 0 ? <div className="mt-12 rounded-2xl border border-line bg-paper p-12 text-center text-ink-mute">Your cookbook is empty. Add a recipe to get started.</div>
        : <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">{recipes.map((item, index) =>
          <a key={item.id} href={localHref("recipe", item.id)} className={`block overflow-hidden rounded-xl bg-paper transition-shadow hover:shadow-md ${index === 0 ? "border-2 border-terra" : "border border-line"}`}>
            <div className="aspect-video bg-paper-2" /><div className="flex flex-col gap-1 p-4"><p className="font-serif text-xl text-ink">{item.title}</p><p className="text-sm text-ink-mute">{item.times_made ? `${item.times_made}× cooked` : "just added"}</p></div>
          </a>)}</div>}
    </>;
  }

  if (route.view === "recipe") {
    if (!recipe) return <MissingRecipe />;
    return <RecipeDetail recipe={recipe} onMarkCooked={async () => {
      const session = await beginCookSession(recipe.id);
      await completeCookSession(recipe.id, session.session_id!);
    }} onStartCook={async () => {
      await beginCookSession(recipe.id, true);
      window.location.hash = localHref("cook", recipe.id).split("#")[1];
    }} />;
  }

  if (route.view === "edit") {
    if (route.recipeId && !recipe) return <MissingRecipe />;
    return <RecipeEditForm key={recipe?.id ?? manualRecipe.id} recipe={recipe ?? manualRecipe} isNew={!route.recipeId} onSave={async (saved) => {
      await putRecipe(saved);
      window.location.hash = localHref("recipe", saved.id).split("#")[1];
    }} />;
  }

  if (route.view === "cook") {
    if (!recipe) return <MissingRecipe />;
    if (!progress?.session_id) return <p role="status" className="text-ink-mute">Opening cook mode…</p>;
    return <CookMode key={`${recipe.id}:${progress.session_id}`} recipe={recipe} progress={progress} pantry={snapshot.pantry} onSaveProgress={saveCookProgress}
      onComplete={(sessionId) => completeCookSession(recipe.id, sessionId)} onSetPantryStatus={setPantryStatus} />;
  }

  if (route.view === "import") return <>
    <SectionHeader number="05" scene="NEW RECIPE" title={<>Save a <em className="italic text-terra">recipe</em>.</>} description="Manual entry works offline. Online imports are available when connected." />
    <div className="mt-12 rounded-2xl border border-line bg-paper p-8"><a href={localHref("edit")} className="inline-flex min-h-11 items-center rounded-full bg-terra px-5 text-sm font-semibold text-white">Enter a recipe manually</a><p className="mt-4 text-sm text-ink-mute">Website, video, screenshot, and text import will appear here once online import is connected.</p><a href={localHref("settings")} className="mt-4 inline-block text-sm text-terra underline">Local data and backups</a></div>
  </>;

  const labels = {
    plan: ["01", "THE WEEK", "Plan your week.", "Your local meal plan will appear here."],
    shop: ["03", "SHOPPING", "What you actually need.", "Your local shopping list will appear here."],
    pantry: ["04", "YOUR KITCHEN", "What's on hand.", "Your local pantry will appear here."],
  } as const;
  const [number, scene, title, empty] = labels[route.view];
  return <><SectionHeader number={number} scene={scene} title={title} description="Stored on this device for offline use." />
    <div className="mt-12 rounded-2xl border border-line bg-paper p-8 text-ink-mute">{empty}</div></>;
}
