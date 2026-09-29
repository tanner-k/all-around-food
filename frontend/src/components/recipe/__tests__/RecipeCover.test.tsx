import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { COVER_TINTS, RecipeCover, coverInitial, coverTint } from "../RecipeCover";

const base = { title: "Braised Leeks", cuisine: null, course: null };

function cover(container: HTMLElement) {
  return container.querySelector("[data-recipe-cover]") as HTMLElement;
}

describe("RecipeCover", () => {
  it("renders a decorative tint and serif initial with no image", () => {
    const { container } = render(<RecipeCover recipe={base} className="aspect-video" />);
    const el = cover(container);
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveTextContent("B");
    expect(el.className).toContain("aspect-video");
    expect(el.querySelector("span")?.className).toContain("font-serif");
    expect(el.querySelector("span")?.className).toContain("text-ink-soft");
    expect(COVER_TINTS.some((tint) => el.className.includes(tint))).toBe(true);
    expect(container.querySelector("img")).toBeNull();
  });

  it("picks the same tint for the same recipe every time", () => {
    const recipe = { ...base, cuisine: "Italian" };
    expect(coverTint(recipe)).toBe(coverTint({ ...recipe }));
    const first = cover(render(<RecipeCover recipe={recipe} />).container).className;
    const second = cover(render(<RecipeCover recipe={recipe} />).container).className;
    expect(first).toBe(second);
  });

  it("hashes cuisine, then course, then title", () => {
    const tints = new Set(["Italian", "Thai", "Mexican", "French", "Korean", "Greek"].map((cuisine) => coverTint({ ...base, cuisine })));
    expect(tints.size).toBeGreaterThan(1);
    expect(coverTint({ title: "Anything", cuisine: "Thai", course: "Dinner" })).toBe(coverTint({ title: "Other", cuisine: "thai ", course: null }));
    expect(coverTint({ title: "Anything", cuisine: null, course: "Dinner" })).toBe(coverTint({ title: "Other", cuisine: "", course: "Dinner" }));
    expect(coverTint({ title: "Soup", cuisine: "  ", course: null })).toBe(coverTint({ title: "Soup", cuisine: null, course: null }));
  });

  it("uppercases the first character of the trimmed title", () => {
    expect(coverInitial("  apple pie")).toBe("A");
    expect(coverInitial("éclair")).toBe("É");
    expect(coverInitial("🍜 noodles")).toBe("🍜");
  });

  it("renders only the tint when the title is empty", () => {
    const { container } = render(<RecipeCover recipe={{ ...base, title: "   " }} />);
    expect(cover(container)).toBeEmptyDOMElement();
  });
});
