"use client";

import { useState } from "react";
import type { Evaluation } from "@/lib/eval-schema";
import { GradeChip } from "./GradeChip";

interface EvalTableProps {
  evaluations: Evaluation[];
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EvalTable({ evaluations }: EvalTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (evaluations.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-paper p-8 text-center text-ink-mute">
        No evaluations yet. Import a recipe to generate the first one.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-paper overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_60px_160px_80px_80px_80px] gap-3 px-4 py-3 bg-paper-2 text-xs font-semibold uppercase tracking-wide text-ink-mute border-b border-line">
        <span>Source</span>
        <span>Kind</span>
        <span>Date</span>
        <span>Overall</span>
        <span>Accuracy</span>
        <span>Complete</span>
      </div>

      {/* Rows */}
      {evaluations.map((ev) => {
        const isOpen = expandedId === ev.id;
        return (
          <div key={ev.id} className="border-b border-line last:border-b-0">
            {/* Summary row */}
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : ev.id)}
              className="w-full grid grid-cols-[1fr_60px_160px_80px_80px_80px] gap-3 px-4 py-3 text-left hover:bg-paper-2 transition-colors text-sm"
            >
              <span className="text-ink truncate font-mono text-xs">
                {truncate(ev.source_ref, 40)}
              </span>
              <span className="text-xl leading-none">
                {ev.source_kind === "image" ? "📷" : "🔗"}
              </span>
              <span className="text-ink-mute text-xs">{formatDate(ev.created_at)}</span>
              <span>
                <GradeChip grade={ev.overall_grade} />
              </span>
              <span>
                <GradeChip grade={ev.accuracy_grade} />
              </span>
              <span>
                <GradeChip grade={ev.completeness_grade} />
              </span>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-4 pb-5 pt-1 flex flex-col gap-4 bg-paper-2 text-sm">
                {/* Strengths */}
                {ev.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest mb-1.5">
                      Strengths
                    </p>
                    <ul className="flex flex-col gap-1">
                      {ev.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-ink">
                          <span className="text-forest flex-shrink-0">✓</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Weaknesses */}
                {ev.weaknesses.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-terra mb-1.5">
                      Weaknesses
                    </p>
                    <ul className="flex flex-col gap-1">
                      {ev.weaknesses.map((w, i) => (
                        <li key={i} className="flex gap-2 text-ink">
                          <span className="text-terra flex-shrink-0">·</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Reasoning */}
                {ev.reasoning && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1.5">
                      Reasoning
                    </p>
                    <p className="text-ink-soft leading-relaxed">{ev.reasoning}</p>
                  </div>
                )}

                {/* Field checks */}
                {ev.field_checks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
                      Field checks
                    </p>
                    <div className="rounded-lg overflow-hidden border border-line">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-paper border-b border-line">
                            <th className="text-left px-3 py-2 text-ink-mute font-semibold">
                              Field
                            </th>
                            <th className="text-left px-3 py-2 text-ink-mute font-semibold">
                              Issue
                            </th>
                            <th className="text-left px-3 py-2 text-ink-mute font-semibold">
                              Detail
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ev.field_checks.map((fc, i) => (
                            <tr
                              key={i}
                              className="border-t border-line odd:bg-paper even:bg-paper-2"
                            >
                              <td className="px-3 py-2 font-mono text-ink">
                                {fc.field}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    fc.issue === "fine"
                                      ? "text-forest"
                                      : fc.issue === "missing"
                                      ? "text-warn"
                                      : "text-terra"
                                  }
                                >
                                  {fc.issue}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-ink-soft">
                                {fc.detail}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Suggested prompt improvements */}
                {ev.suggested_prompt_improvements && (
                  <div className="bg-warn-soft border border-warn rounded-lg p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warn mb-1">
                      Suggested prompt improvement
                    </p>
                    <p className="text-ink italic text-sm leading-relaxed">
                      {ev.suggested_prompt_improvements}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
