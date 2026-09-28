import type { HTMLAttributes, ReactNode } from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps
  extends Omit<HTMLAttributes<HTMLElement>, "className" | "children"> {
  /** Adds hover elevation for cards that act as links or buttons. */
  interactive?: boolean;
  padding?: CardPadding;
  /** Element to render; defaults to `div`. */
  as?: "div" | "section" | "article" | "li";
  /** Layout-only classes (grid placement, margin, flex). Not for surface styles. */
  className?: string;
  children: ReactNode;
}

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5",
  lg: "p-6 md:p-8",
};

export function Card({
  interactive = false,
  padding = "md",
  as: Tag = "div",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Tag
      {...props}
      className={[
        "rounded-card border border-line bg-paper shadow-card",
        paddings[padding],
        interactive &&
          "transition-shadow hover:shadow-raised focus-within:shadow-raised",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}
