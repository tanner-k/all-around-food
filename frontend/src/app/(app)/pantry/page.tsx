import { SectionHeader } from "@/components/SectionHeader";
import { PantryView } from "@/components/pantry/PantryView";
import { listPantryItems } from "@/lib/db/pantry";

export default async function PantryPage() {
  const items = await listPantryItems();

  return (
    <>
      <SectionHeader
        number="04"
        scene="YOUR KITCHEN"
        title={
          <>
            What&apos;s <em className="italic text-terra">on hand</em>.
          </>
        }
        description="Track ingredients. Mark what's running low so your shopping list stays smart."
      />

      <div className="mt-12">
        <PantryView initialItems={items} />
      </div>
    </>
  );
}
