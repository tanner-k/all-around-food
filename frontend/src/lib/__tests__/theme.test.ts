import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TERRA_HEX } from "@/lib/theme";

const globalsCss = readFileSync(
  path.resolve(__dirname, "../../app/globals.css"),
  "utf8"
);

describe("theme literals", () => {
  it("TERRA_HEX matches --color-terra in globals.css", () => {
    const match = globalsCss.match(/--color-terra:\s*(#[0-9A-Fa-f]{6})\s*;/);
    expect(match?.[1]?.toUpperCase()).toBe(TERRA_HEX.toUpperCase());
  });

  it("defines the shared token names from the premium-ui contract", () => {
    for (const token of [
      "--color-terra-strong",
      "--color-danger",
      "--color-danger-soft",
      "--color-focus",
      "--radius-control",
      "--radius-card",
      "--radius-sheet",
      "--shadow-card",
      "--shadow-raised",
      "--shadow-overlay",
      "--ease-out-soft",
      "--ease-spring",
      "--duration-fast",
      "--duration-base",
      "--duration-slow",
    ]) {
      expect(globalsCss).toContain(`${token}:`);
    }
  });

  it("does not redefine Tailwind's own radius scale", () => {
    expect(globalsCss).not.toMatch(/--radius-(sm|md|lg|xl):/);
  });
});
