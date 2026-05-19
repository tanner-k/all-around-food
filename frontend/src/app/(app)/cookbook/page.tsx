import { SectionHeader } from "@/components/SectionHeader";

export default function CookbookPage() {
  return (
    <>
      <SectionHeader
        number="02"
        scene="YOUR LIBRARY"
        title={
          <>
            Every recipe you&apos;ve{" "}
            <em className="italic text-terra">saved</em>.
          </>
        }
        description="Sorted by what you cook most. Search, filter, suggest."
      />
      <div className="mt-20 rounded-lg border border-line bg-paper p-10 text-ink-mute">
        Phase A scaffold — implementation coming soon.
      </div>
    </>
  );
}
