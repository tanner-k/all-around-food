import { SectionHeader } from "@/components/SectionHeader";
import { ShoppingListView } from "@/components/shopping/ShoppingListView";
import { getShoppingList, listRecipeOptions } from "@/lib/db/shopping";
import type { ShoppingListResponse } from "@/lib/shopping-schema";

const EMPTY_LIST: ShoppingListResponse = {
  groups: [],
  total_visible: 0,
};

export default async function ShopPage() {
  let list: ShoppingListResponse = EMPTY_LIST;
  let recipeOptions: { id: string; title: string }[] = [];
  try {
    [list, recipeOptions] = await Promise.all([
      getShoppingList(),
      listRecipeOptions(),
    ]);
  } catch {
    list = EMPTY_LIST;
    recipeOptions = [];
  }

  return (
    <>
      <SectionHeader
        number="03"
        scene="SHOPPING"
        title={
          <>
            What you <em className="italic text-terra">actually</em> need.
          </>
        }
        description="Grouped by store section. Pantry stock is flagged."
      />

      <div className="mt-12">
        <ShoppingListView initial={list} recipeOptions={recipeOptions} />
      </div>
    </>
  );
}
