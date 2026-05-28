import { SectionHeader } from "@/components/SectionHeader";
import { ShoppingListView } from "@/components/shopping/ShoppingListView";
import { BACKEND_URL } from "@/lib/backend-url";
import type { ShoppingListResponse } from "@/lib/shopping-schema";

const EMPTY_LIST: ShoppingListResponse = {
  groups: [],
  total_visible: 0,
};

async function getShoppingList(): Promise<ShoppingListResponse> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/shopping-list`,
      { cache: "no-store" }
    );
    if (!res.ok) return EMPTY_LIST;
    return (await res.json()) as ShoppingListResponse;
  } catch {
    return EMPTY_LIST;
  }
}

export default async function ShopPage() {
  const list = await getShoppingList();

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
        <ShoppingListView initial={list} />
      </div>
    </>
  );
}
