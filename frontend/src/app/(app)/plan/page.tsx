import { SectionHeader } from "@/components/SectionHeader";
import { PlanView } from "@/components/plan/PlanView";
import type { MealPlan } from "@/lib/meal-plan-schema";
import type { Recipe } from "@/lib/recipe-schema";
import { currentMonday } from "@/lib/week";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

async function getMealPlan(weekOf: string): Promise<MealPlan> {
  const empty: MealPlan = { week_of: weekOf, meals: [], updated_at: "" };
  try {
    const res = await fetch(`${BACKEND}/meal-plans/${weekOf}`, {
      cache: "no-store",
    });
    if (!res.ok) return empty;
    return (await res.json()) as MealPlan;
  } catch {
    return empty;
  }
}

async function getRecipeOptions(): Promise<{ id: string; title: string }[]> {
  try {
    const res = await fetch(`${BACKEND}/recipes`, { cache: "no-store" });
    if (!res.ok) return [];
    const recipes = (await res.json()) as Recipe[];
    return recipes.map((r) => ({ id: r.id, title: r.title }));
  } catch {
    return [];
  }
}

export default async function PlanPage() {
  const weekOf = currentMonday();
  const [plan, recipes] = await Promise.all([
    getMealPlan(weekOf),
    getRecipeOptions(),
  ]);

  return (
    <>
      <SectionHeader
        number="01"
        scene="THE WEEK"
        title={
          <>
            Plan your <em className="italic text-terra">week</em>.
          </>
        }
        description="Add a recipe to each day, then turn it into a shopping list."
      />

      <div className="mt-12">
        <PlanView weekOf={weekOf} initialPlan={plan} recipes={recipes} />
      </div>
    </>
  );
}
