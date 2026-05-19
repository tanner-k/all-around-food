interface GradeChipProps {
  grade: number;
}

export function GradeChip({ grade }: GradeChipProps) {
  const colorClass =
    grade >= 8
      ? "bg-forest-soft text-forest"
      : grade >= 4
      ? "bg-warn-soft text-warn"
      : "bg-terra-soft text-terra";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {grade}/10
    </span>
  );
}
