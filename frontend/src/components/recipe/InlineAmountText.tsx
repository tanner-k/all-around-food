import React from "react";

interface InlineAmountTextProps {
  instruction: string;
  inlineAmounts: string[];
}

/**
 * Renders an instruction string with any occurrence of an `inlineAmounts`
 * entry wrapped in a `.amt`-style pill span.
 *
 * Matches are case-insensitive; longest patterns are tried first so that
 * "1 lb asparagus" is highlighted before "asparagus".
 */
export function InlineAmountText({
  instruction,
  inlineAmounts,
}: InlineAmountTextProps): React.ReactElement {
  if (!inlineAmounts.length) {
    return <>{instruction}</>;
  }

  // Sort longest first so longer phrases win over substrings.
  const sorted = [...inlineAmounts].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((s) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = instruction.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className="bg-terra-soft text-terra px-1.5 py-0.5 rounded-md text-[0.95em] font-medium whitespace-nowrap"
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
