import { type ReactNode } from "react";

type PillVariant = "default" | "dark" | "terra" | "terra-soft" | "forest" | "warn";

interface PillProps {
  variant?: PillVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<PillVariant, string> = {
  default: "bg-paper-2 text-ink-soft border border-line",
  dark: "bg-ink text-paper border-ink",
  terra: "bg-terra text-white border-terra",
  "terra-soft": "bg-terra-soft text-terra border-transparent",
  forest: "bg-forest-soft text-forest border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
};

export function Pill({ variant = "default", children, className = "" }: PillProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] whitespace-nowrap",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
