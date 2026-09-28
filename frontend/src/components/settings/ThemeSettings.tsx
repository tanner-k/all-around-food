"use client";

import { useId, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import {
  readThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";

const options: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeSettings() {
  const headingId = useId();
  const preference = useSyncExternalStore(subscribeThemePreference, readThemePreference, () => "system" as const);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === preference);

  function choose(index: number, focus: boolean) {
    setThemePreference(options[index].value);
    if (focus) buttons.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    choose(next, true);
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <h2 id={headingId} className="font-serif text-2xl text-balance">Appearance</h2>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-line-strong p-1"
      >
        {options.map(({ value, label, Icon }, index) => {
          const checked = index === selectedIndex;
          return (
            <button
              key={value}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => choose(index, false)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                checked ? "bg-terra-strong text-on-accent" : "text-ink-soft hover:bg-paper-2"
              }`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-soft">System follows your device setting. Saved on this device only.</p>
    </div>
  );
}
