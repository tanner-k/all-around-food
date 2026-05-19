import { SectionHeader } from "@/components/SectionHeader";

export default function PantryPage() {
  return (
    <>
      <SectionHeader
        number="04"
        scene="YOUR KITCHEN"
        title={
          <>
            What&apos;s{" "}
            <em className="italic text-terra">on hand</em>.
          </>
        }
        description="Track ingredients. Low-stock alerts before you run out."
      />
      <div className="mt-20 rounded-lg border border-line bg-paper p-10 text-ink-mute">
        Phase A scaffold — implementation coming soon.
      </div>
    </>
  );
}
