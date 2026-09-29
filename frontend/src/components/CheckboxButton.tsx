"use client";

export type CheckboxButtonSize = "md" | "sm";

type CheckboxButtonLabel =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

export type CheckboxButtonProps = CheckboxButtonLabel & {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** "md" draws a 44px box; "sm" draws a 20px box. Both keep a 44px hit area. */
  size?: CheckboxButtonSize;
  id?: string;
  "aria-describedby"?: string;
  /** Layout-only classes (margin, alignment). Not for colors or shape. */
  className?: string;
};

const boxSize: Record<CheckboxButtonSize, string> = {
  md: "size-11 rounded-lg",
  sm: "size-5 rounded-md",
};

/**
 * Custom checkbox: a `<button role="checkbox" aria-checked>` with a token-colored
 * box and an inline SVG check. The one checkbox language for the app.
 */
export function CheckboxButton({
  checked,
  onChange,
  disabled = false,
  size = "md",
  className,
  ...aria
}: CheckboxButtonProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...aria}
      className={[
        "inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden="true"
        data-checkbox-box=""
        className={[
          "flex items-center justify-center border-[1.5px] transition-colors",
          boxSize[size],
          checked
            ? "border-terra bg-terra text-on-accent"
            : "border-ink-mute bg-paper",
        ].join(" ")}
      >
        {checked && (
          <svg
            viewBox="0 0 10 10"
            className="h-2.5 w-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 5.5l2 2 4-4" />
          </svg>
        )}
      </span>
    </button>
  );
}
