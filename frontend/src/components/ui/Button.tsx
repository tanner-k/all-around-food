"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "primary" | "terra" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const variantClasses: Record<Variant, string> = {
  default:
    "bg-paper-2 text-ink border border-line hover:bg-line transition-colors",
  primary:
    "bg-ink text-paper border border-ink hover:bg-ink/90 transition-colors",
  terra:
    "bg-terra text-paper border border-terra hover:bg-terra/90 transition-colors",
  ghost:
    "bg-transparent text-ink-soft border border-transparent hover:border-line hover:text-ink transition-colors",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-xs",
  lg: "px-5 py-2.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "default",
      size = "md",
      block = false,
      className = "",
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold leading-none",
          "disabled:cursor-not-allowed disabled:opacity-40",
          variantClasses[variant],
          sizeClasses[size],
          block ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
