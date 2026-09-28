import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalRoute } from "../navigation";
import { navDirection, routeDepth, sameRoute, transitionRoute } from "../route-transition";

const plan: LocalRoute = { view: "plan" };
const cookbook: LocalRoute = { view: "cookbook" };
const shop: LocalRoute = { view: "shop" };
const recipe = (recipeId: string): LocalRoute => ({ view: "recipe", recipeId });
const edit = (recipeId: string | null): LocalRoute => ({ view: "edit", recipeId });
const cook = (recipeId: string): LocalRoute => ({ view: "cook", recipeId });

/** lib.dom types startViewTransition; tests swap in a minimal stand-in. */
type Doc = { startViewTransition?: unknown };

function mockMatchMedia(reduce: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: reduce && query.includes("reduce"), media: query })));
}

/** A startViewTransition that runs the callback synchronously, like the browser does after the old snapshot. */
function mockViewTransitions() {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const seen: { direction?: string } = {};
  const start = vi.fn((callback: () => void) => {
    seen.direction = document.documentElement.dataset.navDirection;
    callback();
    return { finished };
  });
  (document as unknown as Doc).startViewTransition = start;
  return { start, finish: () => { finish(); return finished.then(() => undefined); }, seen };
}

afterEach(() => {
  delete (document as unknown as Doc).startViewTransition;
  delete document.documentElement.dataset.navDirection;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("direction inference", () => {
  it("gives tab screens depth 0, detail 1, edit and cook 2", () => {
    for (const route of [plan, cookbook, shop, { view: "pantry" } as LocalRoute, { view: "import" } as LocalRoute, { view: "settings" } as LocalRoute]) {
      expect(routeDepth(route)).toBe(0);
    }
    expect(routeDepth(recipe("a"))).toBe(1);
    expect(routeDepth(edit("a"))).toBe(2);
    expect(routeDepth(edit(null))).toBe(2);
    expect(routeDepth(cook("a"))).toBe(2);
  });

  it.each([
    [cookbook, recipe("a"), "push"],
    [recipe("a"), cook("a"), "push"],
    [recipe("a"), edit("a"), "push"],
    [cookbook, edit(null), "push"],
    [plan, cook("a"), "push"],
    [recipe("a"), cookbook, "pop"],
    [cook("a"), recipe("a"), "pop"],
    [edit("a"), recipe("a"), "pop"],
    [cook("a"), plan, "pop"],
    [plan, cookbook, "tab"],
    [cookbook, shop, "tab"],
    [recipe("a"), recipe("b"), "tab"],
    [edit("a"), cook("a"), "tab"],
  ] as const)("%o → %o is %s", (prev, next, direction) => {
    expect(navDirection(prev, next)).toBe(direction);
  });

  it("compares view, recipe and week", () => {
    expect(sameRoute(recipe("a"), recipe("a"))).toBe(true);
    expect(sameRoute(recipe("a"), recipe("b"))).toBe(false);
    expect(sameRoute(recipe("a"), edit("a"))).toBe(false);
    expect(sameRoute({ view: "plan", weekOf: "2026-09-28" }, plan)).toBe(false);
    expect(sameRoute(cookbook, { view: "cookbook" })).toBe(true);
  });
});

describe("transitionRoute", () => {
  it("commits directly when startViewTransition is missing", () => {
    const commit = vi.fn();
    transitionRoute(cookbook, recipe("a"), commit);
    expect(commit).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  it("commits directly under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    const { start } = mockViewTransitions();
    const commit = vi.fn();
    transitionRoute(cookbook, recipe("a"), commit);
    expect(commit).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("commits directly when the route did not change", () => {
    mockMatchMedia(false);
    const { start } = mockViewTransitions();
    const commit = vi.fn();
    transitionRoute(recipe("a"), recipe("a"), commit);
    expect(commit).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("commits synchronously inside the transition and clears the direction afterwards", async () => {
    mockMatchMedia(false);
    const { start, finish, seen } = mockViewTransitions();
    const commit = vi.fn();
    transitionRoute(cookbook, recipe("a"), commit);
    expect(start).toHaveBeenCalledOnce();
    expect(seen.direction).toBe("push");
    // The callback returned, so the commit already ran (flushSync) before the "after" snapshot.
    expect(commit).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.navDirection).toBe("push");
    await finish();
    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });

  it("keeps a newer transition's direction when an older one finishes", async () => {
    mockMatchMedia(false);
    const first = mockViewTransitions();
    transitionRoute(cookbook, recipe("a"), vi.fn());
    mockViewTransitions();
    transitionRoute(recipe("a"), cookbook, vi.fn());
    await first.finish();
    expect(document.documentElement.dataset.navDirection).toBe("pop");
  });

  describe("card ↔ detail morph", () => {
    /** Cards laid out on screen; jsdom's default 0×0 rect at the top edge counts as off screen. */
    function renderCards(ids: string[]) {
      document.body.innerHTML = ids.map((id) =>
        `<a data-recipe-card="${id}"><div data-recipe-cover></div><p data-recipe-title>${id}</p></a>`).join("");
      for (const card of document.querySelectorAll("[data-recipe-card]")) {
        vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 300 } as DOMRect);
      }
    }
    function renderDetail(id: string) {
      document.body.innerHTML = `<div data-recipe-detail="${id}"><h1 data-recipe-title>${id}</h1><div data-recipe-cover></div></div>`;
    }
    const names = () => [...document.querySelectorAll<HTMLElement>("*")]
      .filter((element) => element.style.viewTransitionName)
      .map((element) => `${element.tagName.toLowerCase()}:${element.style.viewTransitionName}`);

    it("names only the tapped card before the snapshot, then only the detail after commit", async () => {
      mockMatchMedia(false);
      renderCards(["a", "b", "c"]);
      let before: string[] = [];
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => { finish = resolve; });
      (document as unknown as Doc).startViewTransition = vi.fn((callback: () => void) => {
        before = names();
        callback();
        return { finished };
      });
      transitionRoute(cookbook, recipe("b"), () => renderDetail("b"));
      // Card "b" only: cards "a" and "c" stay unnamed.
      expect(before).toEqual(["div:recipe-cover", "p:recipe-title"]);
      expect(names()).toEqual(["h1:recipe-title", "div:recipe-cover"]);
      finish();
      await finished;
      await Promise.resolve();
      expect(names()).toEqual([]);
    });

    it("names the detail before the snapshot and the matching card after a pop", () => {
      mockMatchMedia(false);
      renderDetail("b");
      let before: string[] = [];
      let after: string[] = [];
      (document as unknown as Doc).startViewTransition = vi.fn((callback: () => void) => {
        before = names();
        callback();
        after = names();
        return { finished: new Promise(() => undefined) };
      });
      transitionRoute(recipe("b"), cookbook, () => renderCards(["a", "b"]));
      expect(before).toEqual(["h1:recipe-title", "div:recipe-cover"]);
      expect(after).toEqual(["div:recipe-cover", "p:recipe-title"]);
      const cardA = document.querySelector<HTMLElement>('[data-recipe-card="a"] [data-recipe-title]')!;
      expect(cardA.style.viewTransitionName ?? "").toBe("");
    });

    it("skips a card that is scrolled out of view", () => {
      mockMatchMedia(false);
      renderCards(["a"]);
      const card = document.querySelector("[data-recipe-card]")!;
      vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: 5000, bottom: 5200 } as DOMRect);
      let before: string[] = ["unset"];
      (document as unknown as Doc).startViewTransition = vi.fn((callback: () => void) => {
        before = names();
        callback();
        return { finished: new Promise(() => undefined) };
      });
      transitionRoute(cookbook, recipe("a"), () => undefined);
      expect(before).toEqual([]);
    });

    it("does not name anything for other navigations", () => {
      mockMatchMedia(false);
      renderCards(["a"]);
      let before: string[] = ["unset"];
      (document as unknown as Doc).startViewTransition = vi.fn((callback: () => void) => {
        before = names();
        callback();
        return { finished: new Promise(() => undefined) };
      });
      transitionRoute(cookbook, shop, () => undefined);
      expect(before).toEqual([]);
    });
  });
});
