import { SectionHeader } from "@/components/SectionHeader";
import { EvalTable } from "@/components/eval/EvalTable";
import type { Evaluation } from "@/lib/eval-schema";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

interface EvalStats {
  count: number;
  mean_overall: number;
  mean_accuracy: number;
  mean_completeness: number;
}

async function getEvaluations(): Promise<Evaluation[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/evaluations`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as Evaluation[];
  } catch {
    return [];
  }
}

async function getStats(): Promise<EvalStats | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/evaluations/stats`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as EvalStats;
  } catch {
    return null;
  }
}

function StatNumber({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif italic text-terra" style={{ fontSize: "48px", lineHeight: 1 }}>
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
      <div className="grid grid-cols-4 gap-8 mt-12">
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
