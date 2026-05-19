import { SectionHeader } from "@/components/SectionHeader";

export default function ShopPage() {
  return (
    <>
      <SectionHeader
        number="03"
        scene="SHOPPING"
        title={
          <>
            What you{" "}
            <em className="italic text-terra">actually</em> need.
          </>
        }
        description="Grouped by store section. Pantry is subtracted."
      />
      <div className="mt-20 rounded-lg border border-line bg-paper p-10 text-ink-mute">
        Phase A scaffold — implementation coming soon.
      </div>
    </>
  );
}
