import { SectionHeader } from "@/components/SectionHeader";
import { PlanView } from "@/components/plan/PlanView";
import { getMealPlan } from "@/lib/db/meal-plans";
import { listRecipes } from "@/lib/db/recipes";
import { currentMonday } from "@/lib/week";

async function getRecipeOptions(): Promise<{ id: string; title: string }[]> {
  const recipes = await listRecipes();
  return recipes.map((r) => ({ id: r.id, title: r.title }));
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
