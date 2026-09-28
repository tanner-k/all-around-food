"use client";

import type { ReactNode, RefObject } from "react";
import { Overlay, type OverlayLabelProps } from "./internal/Overlay";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Desktop max width: md = max-w-lg, lg = max-w-2xl. */
  size?: "md" | "lg";
} & OverlayLabelProps;

const sizes = { md: "md:max-w-lg", lg: "md:max-w-2xl" } as const;

/** Bottom sheet on mobile, centered panel from `md:`. Consumers render their own header/close. */
export function Sheet({ size = "md", children, ...props }: SheetProps) {
  return (
    <Overlay
      {...props}
      containerClassName="flex items-end justify-center md:items-center md:p-6"
      panelClassName={[
        "w-full max-h-[90dvh] overflow-y-auto rounded-t-sheet bg-paper text-ink shadow-overlay",
        "pb-[max(1rem,env(safe-area-inset-bottom))] md:rounded-sheet md:pb-4",
        sizes[size],
        // Entry motion: full-height slide below md, a short lift + fade from md.
        "transition-[opacity,translate,scale] duration-(--duration-base) ease-(--ease-out-soft)",
        "starting:translate-y-full md:starting:translate-y-2 md:starting:scale-[0.98] md:starting:opacity-0",
      ].join(" ")}
    >
      <div aria-hidden="true" className="flex justify-center pt-2 md:hidden">
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </div>
      {children}
    </Overlay>
  );
}
