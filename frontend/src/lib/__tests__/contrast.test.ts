import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG 2.x contrast for the token pairs the app actually renders, in both
 * themes. Values are parsed from globals.css, so a palette edit that breaks a
 * pair fails here instead of shipping silently.
 */

const globalsCss = readFileSync(
  path.resolve(__dirname, "../../app/globals.css"),
  "utf8"
);

type Tokens = Record<string, string>;

function colorTokens(block: string): Tokens {
  const tokens: Tokens = {};
  for (const [, name, value] of block.matchAll(
    /--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g
  )) {
    tokens[name] = value.toUpperCase();
  }
  return tokens;
}

function blockAfter(marker: string): string {
  const start = globalsCss.indexOf(marker);
  if (start === -1) throw new Error(`globals.css is missing ${marker}`);
  const open = globalsCss.indexOf("{", start + marker.length - 1);
  const close = globalsCss.indexOf("}", open);
  return globalsCss.slice(open + 1, close);
}

const light = colorTokens(blockAfter("@theme {"));
const dark = colorTokens(
  blockAfter(':root[data-theme="dark"],\n[data-cook-theme="dark"] {')
);
const darkMedia = colorTokens(
  blockAfter(':root:not([data-theme="light"]) {')
);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Kind = "text" | "large" | "ui";
const MIN: Record<Kind, number> = { text: 4.5, large: 3, ui: 3 };

/** [foreground, background, kind, where it is used] */
const PAIRS: [string, string, Kind, string][] = [
  // Body and secondary text on every surface.
  ["ink", "bg", "text", "body text"],
  ["ink", "paper", "text", "cards, sheets, inputs"],
  ["ink", "paper-2", "text", "hover rows, chips"],
  ["ink", "terra-soft", "text", "::selection, today row"],
  ["ink-soft", "bg", "text", "descriptions"],
  ["ink-soft", "paper", "text", "card descriptions"],
  ["ink-soft", "paper-2", "text", "DropZone pills"],
  ["ink-soft", "terra-soft", "text", "RecipeCover glyph"],
  ["ink-soft", "forest-soft", "text", "RecipeCover glyph"],
  ["ink-soft", "warn-soft", "text", "RecipeCover glyph"],
  ["ink-mute", "bg", "text", "meta lines, eyebrows"],
  ["ink-mute", "paper", "text", "card meta, empty states"],
  ["ink-mute", "paper-2", "text", "queue pending badge, table header"],
  // Small terracotta text uses terra-strong.
  ["terra-strong", "bg", "text", "links, eyebrows, amounts"],
  ["terra-strong", "paper", "text", "links and labels in cards"],
  ["terra-strong", "paper-2", "text", "hover text on paper-2 rows"],
  ["terra-strong", "terra-soft", "text", "chips, active tab pill"],
  // Status text on surfaces and on their soft fills.
  ["forest", "bg", "text", "success text"],
  ["forest", "paper", "text", "success text in cards"],
  ["forest", "forest-soft", "text", "success chips and notices"],
  ["warn", "bg", "text", "warnings"],
  ["warn", "paper", "text", "warnings in cards"],
  ["warn", "warn-soft", "text", "grade chips"],
  ["danger", "bg", "text", "errors"],
  ["danger", "paper", "text", "errors, danger menu item"],
  ["danger", "danger-soft", "text", "error notices"],
  // Labels on filled accents.
  ["on-accent", "terra-strong", "text", "primary Button, filled pills"],
  ["on-accent", "terra-deep", "text", "primary Button hover/active"],
  ["on-accent", "forest", "text", "In stock pill, backup buttons"],
  ["on-accent", "warn", "text", "Low pill"],
  ["on-accent", "ink-mute", "text", "Out pill"],
  ["on-accent", "danger", "text", "danger Button"],
  // Large display type keeps the bright terra.
  ["terra", "bg", "large", "serif headings, step numbers"],
  ["terra", "paper", "large", "serif headings in cards and sheets"],
  // Non-text UI: icons, fills, rings, boundaries.
  ["terra", "bg", "ui", "icons, progress, checked checkbox"],
  ["terra", "paper", "ui", "checked checkbox, borders"],
  ["on-accent", "terra", "ui", "checkbox tick"],
  ["ink-mute", "paper", "ui", "unchecked checkbox boundary"],
  ["focus", "bg", "ui", "focus ring"],
  ["focus", "paper", "ui", "focus ring in cards"],
  ["focus", "paper-2", "ui", "focus ring on paper-2"],
];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme contrast", (_theme, tokens) => {
  it.each(PAIRS)("%s on %s (%s: %s)", (fg, bg, kind) => {
    expect(tokens[fg], `--color-${fg}`).toBeDefined();
    expect(tokens[bg], `--color-${bg}`).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(
      MIN[kind]
    );
  });
});

describe("dark theme definition", () => {
  it("overrides every light color token", () => {
    const lightHex = Object.keys(light).sort();
    expect(Object.keys(dark).sort()).toEqual(lightHex);
  });

  it("keeps the no-JavaScript media-query copy identical", () => {
    expect(darkMedia).toEqual(dark);
    const alpha = /--(color-scrim|shadow-[a-z]+):\s*([^;]+);/g;
    const pick = (block: string) =>
      Object.fromEntries([...block.matchAll(alpha)].map((m) => [m[1], m[2]]));
    const attr = pick(
      blockAfter(':root[data-theme="dark"],\n[data-cook-theme="dark"] {')
    );
    expect(Object.keys(attr)).toHaveLength(4);
    expect(pick(blockAfter(':root:not([data-theme="light"]) {'))).toEqual(attr);
  });

  it("reproduces the ratios quoted in the owner decision", () => {
    // White on the old terra fill, and white on the new terra-strong fill.
    expect(contrastRatio(light["on-accent"], light.terra)).toBeCloseTo(4.14, 2);
    expect(contrastRatio(light["on-accent"], light["terra-strong"])).toBeCloseTo(6.2, 1);
  });
});
