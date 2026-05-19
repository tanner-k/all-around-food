import { SectionHeader } from "@/components/SectionHeader";

export default function PlanPage() {
  return (
    <>
      <SectionHeader
        number="01"
        scene="THE WEEK"
        title={
          <>
            Plan your{" "}
            <em className="italic text-terra">week</em>.
          </>
        }
        description="Drag recipes into days. Your shopping list updates automatically."
      />
      <div className="mt-20 rounded-lg border border-line bg-paper p-10 text-ink-mute">
        Phase A scaffold — implementation coming soon.
      </div>
    </>
  );
}
