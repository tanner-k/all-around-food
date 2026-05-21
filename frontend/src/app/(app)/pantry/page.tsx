import { SectionHeader } from "@/components/SectionHeader";
import { PantryView } from "@/components/pantry/PantryView";
import type { PantryItem } from "@/lib/pantry-schema";

async function getPantryItems(): Promise<PantryItem[]> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL ?? "http://localhost:8000"}/pantry`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    return (await res.json()) as PantryItem[];
  } catch {
    return [];
  }
}

export default async function PantryPage() {
  const items = await getPantryItems();

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
