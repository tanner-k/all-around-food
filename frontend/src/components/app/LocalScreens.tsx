"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { RecipeDetail } from "@/components/recipe/RecipeDetail";
import { RecipeEditForm } from "@/components/recipe/RecipeEditForm";
import { CookMode } from "@/components/cook/CookMode";
import { DataSettings } from "@/components/settings/DataSettings";
import { LocalImports } from "./LocalImports";
import { PlanView } from "@/components/plan/PlanView";
import { ShoppingListView } from "@/components/shopping/ShoppingListView";
import { PantryView } from "@/components/pantry/PantryView";
import { currentMonday } from "@/lib/week";
import { RecipeSchema, type Recipe } from "@/lib/recipe-schema";
import { localHref, type LocalRoute } from "@/lib/local/navigation";
import { addPantryItem, addPlannedMeal, addRecipesToShopping, addShoppingItem, beginCookSession, completeCookSession, completeShopping, generateWeekShopping, putRecipe, removeRecipe, removePantryItem, removePlannedMeal, removeShoppingItem, saveCookProgress, setPantryStatus, setPlannedServings, setShoppingChecked } from "@/lib/local/repository";
import { assertCurrentLocalAccount, captureLocalAccount, type LocalAccount } from "@/lib/local/db";
import type { LibrarySnapshot } from "@/lib/local/schema";
import type { LibrarySyncView } from "./useLibrarySync";

// Bind before child queues schedule work; only new operations and publication
// are cancelled. An already-started transaction may finish in its original DB.
function bound<Args extends unknown[], Result>(account: LocalAccount, operation: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => {
    assertCurrentLocalAccount(account);
    const result = await operation(...args);
    assertCurrentLocalAccount(account);
    return result;
  };
}

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

/** Mounted only for the new-entry route, so every visit allocates its own id. */
function NewRecipeEditor({ onSave }: { onSave: (recipe: Recipe) => Promise<void> }) {
  const [draft] = useState(blankRecipe);
  return <RecipeEditForm key={draft.id} recipe={draft} isNew onSave={onSave} />;
}

/** Keep a mounted editor and its baseline even if a pull removes the row. */
function ExistingRecipeEditor({ recipe, onSave }: { recipe?: Recipe; onSave: (recipe: Recipe, expected?: Recipe | null) => Promise<void> }) {
  const [displayed] = useState(recipe);
  return displayed ? <RecipeEditForm recipe={displayed} onSave={onSave} /> : <MissingRecipe />;
}

function MissingRecipe() {
  return <div className="mx-auto max-w-xl rounded-2xl border border-line bg-paper p-8 text-center">
    <h1 className="font-serif text-3xl text-ink">Recipe unavailable</h1>
    <p className="mt-3 text-ink-mute">This recipe is not in your local cookbook.</p>
    <a className="mt-5 inline-block text-terra underline" href={localHref("cookbook")}>Back to cookbook</a>
  </div>;
}

export function LocalScreens({ route, snapshot, sync }: { route: LocalRoute; snapshot: LibrarySnapshot; sync?: LibrarySyncView }) {
  const [account] = useState(captureLocalAccount);
  const recipe = "recipeId" in route ? snapshot.recipes.find((item) => item.id === route.recipeId) : undefined;
  const progress = recipe ? snapshot.cook_progress.find((item) => item.recipe_id === recipe.id) : undefined;

  useEffect(() => {
    if (route.view === "cook" && recipe && (!progress || !progress.session_id)) {
      void bound(account, beginCookSession)(recipe.id).catch(() => undefined);
    }
  }, [route.view, recipe, progress, account]);

  if (route.view === "settings") return <DataSettings sync={sync} />;

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
      const session = await bound(account, beginCookSession)(recipe.id);
      await bound(account, completeCookSession)(recipe.id, session.session_id!);
    }} onDelete={async () => {
      await bound(account, removeRecipe)(recipe.id);
      assertCurrentLocalAccount(account);
      window.location.hash = localHref("cookbook").split("#")[1];
    }} onStartCook={async () => {
      await bound(account, beginCookSession)(recipe.id, true);
      assertCurrentLocalAccount(account);
      window.location.hash = localHref("cook", recipe.id).split("#")[1];
    }} />;
  }

  if (route.view === "edit") {
    const save = async (saved: Recipe, expected?: Recipe | null) => {
      await bound(account, putRecipe)(saved, expected);
      assertCurrentLocalAccount(account);
      window.location.hash = localHref("recipe", saved.id).split("#")[1];
    };
    return route.recipeId
      ? <ExistingRecipeEditor key={route.recipeId} recipe={recipe} onSave={save} />
      : <NewRecipeEditor onSave={save} />;
  }

  if (route.view === "cook") {
    if (!recipe) return <MissingRecipe />;
    if (!progress?.session_id) return <p role="status" className="text-ink-mute">Opening cook mode…</p>;
    return <CookMode key={`${recipe.id}:${progress.session_id}`} recipe={recipe} progress={progress} pantry={snapshot.pantry} onSaveProgress={bound(account, saveCookProgress)}
      onComplete={(sessionId) => bound(account, completeCookSession)(recipe.id, sessionId)} onSetPantryStatus={bound(account, setPantryStatus)} />;
  }

  if (route.view === "plan") {
    const weekOf = route.weekOf ?? currentMonday();
    const plan = snapshot.meal_plans.find((item) => item.week_of === weekOf) ?? { week_of: weekOf, meals: [], updated_at: new Date().toISOString() };
    return <><SectionHeader number="01" scene="THE WEEK" title={<>Plan your <em className="italic text-terra">week</em>.</>} description="Add recipes to each day, then turn them into a shopping list." />
      <div className="mt-12"><PlanView key={weekOf} weekOf={weekOf} initialPlan={plan} recipes={snapshot.recipes.map((item) => ({ id: item.id, title: item.title, servings: item.servings }))}
        onAdd={bound(account, addPlannedMeal)} onRemove={bound(account, removePlannedMeal)} onServingsChange={bound(account, setPlannedServings)} onGenerate={bound(account, generateWeekShopping)} /></div></>;
  }

  if (route.view === "shop") return <><SectionHeader number="03" scene="SHOPPING" title={<>What you <em className="italic text-terra">actually</em> need.</>} description="Grouped by store section. Pantry stock is flagged." />
    <div className="mt-12"><ShoppingListView items={snapshot.shopping} recipeOptions={snapshot.recipes.map(({ id, title }) => ({ id, title }))}
      onAdd={bound(account, addShoppingItem)} onAddRecipes={bound(account, addRecipesToShopping)} onCheck={bound(account, setShoppingChecked)} onDelete={bound(account, removeShoppingItem)} onComplete={bound(account, completeShopping)} /></div></>;

  if (route.view === "pantry") return <><SectionHeader number="04" scene="YOUR KITCHEN" title={<>What&apos;s <em className="italic text-terra">on hand</em>.</>} description="Track ingredients. Mark what is running low so your shopping list stays current." />
    <div className="mt-12"><PantryView items={snapshot.pantry} onAdd={bound(account, addPantryItem)} onStatusChange={bound(account, setPantryStatus)} onDelete={bound(account, removePantryItem)} /></div></>;

  if (route.view === "import") return <LocalImports drafts={snapshot.drafts} />;

}
