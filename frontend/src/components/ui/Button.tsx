import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[color,background-color,border-color,scale] duration-(--duration-fast) ease-(--ease-out-soft) not-disabled:not-aria-disabled:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-terra-strong text-on-accent hover:bg-terra-deep active:bg-terra-deep",
  secondary:
    "border border-line-strong bg-paper text-ink hover:bg-paper-2 active:bg-paper-2",
  ghost: "text-ink-soft hover:bg-paper-2 hover:text-ink active:bg-paper-2",
  danger: "bg-danger text-on-accent hover:bg-danger/90 active:bg-danger/90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4 py-1.5 text-sm",
  md: "min-h-11 px-5 py-2 text-sm",
  lg: "min-h-14 px-6 py-3 text-base",
};

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Disables the button and shows a spinner before the label. */
  loading?: boolean;
  /** Layout-only classes (margin, alignment, flex). Not for colors or shape. */
  className?: string;
  children: ReactNode;
}

export type ButtonAsButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

export type ButtonAsLinkProps = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    href: string;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: Pick<ButtonOwnProps, "variant" | "size" | "fullWidth" | "className"> = {}) {
  return [base, variants[variant], sizes[size], fullWidth && "w-full", className]
    .filter(Boolean)
    .join(" ");
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const {
      variant,
      size,
      fullWidth,
      loading,
      className,
      children,
      ...anchorProps
    } = props;
    return (
      <a
        {...anchorProps}
        aria-busy={loading || undefined}
        className={buttonClasses({ variant, size, fullWidth, className })}
      >
        {loading && <Spinner />}
        {children}
      </a>
    );
  }
  const {
    variant,
    size,
    fullWidth,
    loading = false,
    className,
    children,
    disabled,
    type = "button",
    ...buttonProps
  } = props;
  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
