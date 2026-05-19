import { SectionHeader } from "@/components/SectionHeader";

export default function ImportPage() {
  return (
    <>
      <SectionHeader
        number="05"
        scene="NEW RECIPE"
        title={
          <>
            <em className="italic text-terra">Save</em> a recipe.
          </>
        }
        description="Paste a link or drop a screenshot — AI parses the rest."
      />
      <div className="mt-20 rounded-lg border border-line bg-paper p-10 text-ink-mute">
        Phase A scaffold — implementation coming soon.
      </div>
    </>
  );
}
