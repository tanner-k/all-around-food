import { SectionHeader } from "@/components/SectionHeader";
import { ImportFlow } from "./ImportFlow";
import { ImportQueue } from "./ImportQueue";

export default function ImportPage() {
  return (
    <>
      <SectionHeader
        number="05"
        scene="NEW RECIPE"
        title={
          <>
            Save a <em className="italic text-terra">recipe</em>.
          </>
        }
        description="Paste a link or drop a screenshot — AI parses the rest."
      />
      <div className="mt-12">
        <ImportFlow />
        <ImportQueue />
      </div>
    </>
  );
}
