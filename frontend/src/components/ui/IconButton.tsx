import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type IconButtonVariant = "default" | "ghost";

export interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "children" | "aria-label"
  > {
  /** Required: icon-only buttons have no visible text. */
  "aria-label": string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  /** Layout-only classes (margin, alignment). Not for colors or shape. */
  className?: string;
}

const base =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-control transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<IconButtonVariant, string> = {
  default:
    "border border-line bg-paper text-ink-soft hover:bg-paper-2 hover:text-ink active:bg-paper-2",
  ghost: "text-ink-soft hover:bg-paper-2 hover:text-ink active:bg-paper-2",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon, variant = "ghost", className, type = "button", ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        {...props}
        className={[base, variants[variant], className].filter(Boolean).join(" ")}
      >
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      </button>
    );
  }
);
