import { SectionHeader } from "@/components/SectionHeader";
import { EvalTable } from "@/components/eval/EvalTable";
import {
  getEvaluationStats,
  listEvaluations,
  type EvaluationStats,
} from "@/lib/db/evaluations";
import type { Evaluation } from "@/lib/eval-schema";

async function getEvaluations(): Promise<Evaluation[]> {
  try {
    return await listEvaluations();
  } catch {
    return [];
  }
}

async function getStats(): Promise<EvaluationStats | null> {
  try {
    return await getEvaluationStats();
  } catch {
    return null;
  }
}

function StatNumber({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif italic text-terra text-3xl md:text-5xl leading-none">
        {value}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
        {label}
      </span>
    </div>
  );
}

export default async function EvaluationsPage() {
  const [evaluations, stats] = await Promise.all([
    getEvaluations(),
    getStats(),
  ]);

  const displayStats = stats ?? {
    count: evaluations.length,
    mean_overall:
      evaluations.length > 0
        ? +(
            evaluations.reduce((s, e) => s + e.overall_grade, 0) /
            evaluations.length
          ).toFixed(1)
        : 0,
    mean_accuracy:
      evaluations.length > 0
        ? +(
            evaluations.reduce((s, e) => s + e.accuracy_grade, 0) /
            evaluations.length
          ).toFixed(1)
        : 0,
    mean_completeness:
      evaluations.length > 0
        ? +(
            evaluations.reduce((s, e) => s + e.completeness_grade, 0) /
            evaluations.length
          ).toFixed(1)
        : 0,
  };

  return (
    <>
      <SectionHeader
        number="06"
        scene="MODEL GRADING"
        title={
          <>
            Parse <em className="italic text-terra">quality</em>.
          </>
        }
        description="How well is claude-haiku-4-5 extracting your recipes? Graded live by claude-sonnet-4-6."
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mt-12">
        <StatNumber label="Evaluations" value={displayStats.count} />
        <StatNumber label="Mean overall" value={displayStats.mean_overall} />
        <StatNumber label="Mean accuracy" value={displayStats.mean_accuracy} />
        <StatNumber
          label="Mean completeness"
          value={displayStats.mean_completeness}
        />
      </div>

      {/* Table */}
      <div className="mt-10">
        <EvalTable evaluations={evaluations} />
      </div>
    </>
  );
}
