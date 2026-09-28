import { flushSync } from "react-dom";
import type { LocalRoute } from "./navigation";

/**
 * Route transitions for the hash-routed /app shell (plan 06).
 *
 * `hashchange` fires asynchronously, so the view transition starts inside the
 * listener: the old screen is still on the page for the "before" snapshot, and
 * `flushSync(commit)` inside the callback renders the new one for "after".
 * Links are never intercepted.
 */

export type NavDirection = "push" | "pop" | "tab";

/** Name the recipe card title/cover and the detail title/cover share while morphing. */
export const MORPH_NAMES = { title: "recipe-title", cover: "recipe-cover" } as const;

/** Tab-level screens are 0, recipe detail is 1, edit and cook are 2. */
export function routeDepth(route: LocalRoute): number {
  if (route.view === "recipe") return 1;
  if (route.view === "edit" || route.view === "cook") return 2;
  return 0;
}

export function sameRoute(a: LocalRoute, b: LocalRoute): boolean {
  return a.view === b.view
    && ("recipeId" in a ? a.recipeId : null) === ("recipeId" in b ? b.recipeId : null)
    && ("weekOf" in a ? a.weekOf : undefined) === ("weekOf" in b ? b.weekOf : undefined);
}

/** Deeper is a push, shallower a pop, and a different screen at the same depth is a tab switch. */
export function navDirection(prev: LocalRoute, next: LocalRoute): NavDirection {
  const from = routeDepth(prev);
  const to = routeDepth(next);
  return to > from ? "push" : to < from ? "pop" : "tab";
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function morphRecipeId(prev: LocalRoute, next: LocalRoute): { id: string; from: "card" | "detail" } | null {
  if (prev.view === "cookbook" && next.view === "recipe" && next.recipeId) return { id: next.recipeId, from: "card" };
  if (prev.view === "recipe" && next.view === "cookbook" && prev.recipeId) return { id: prev.recipeId, from: "detail" };
  return null;
}

function inViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

/** The cookbook card for `id`, only when it is on screen: an off-screen morph reads as a jump. */
function findCard(id: string): Element | null {
  const card = [...document.querySelectorAll("[data-recipe-card]")].find((node) => node.getAttribute("data-recipe-card") === id);
  return card && inViewport(card) ? card : null;
}

function findDetail(id: string): Element | null {
  return [...document.querySelectorAll("[data-recipe-detail]")].find((node) => node.getAttribute("data-recipe-detail") === id) ?? null;
}

/**
 * Names the title and cover inside `scope`. Only one element carries each name
 * at a time, so a long cookbook never captures dozens of snapshots.
 */
function nameMorph(scope: Element | null, named: HTMLElement[]) {
  if (!scope) return;
  const pairs: [string, string][] = [["[data-recipe-title]", MORPH_NAMES.title], ["[data-recipe-cover]", MORPH_NAMES.cover]];
  for (const [selector, name] of pairs) {
    const element = scope.querySelector<HTMLElement>(selector);
    if (!element) continue;
    element.style.viewTransitionName = name;
    named.push(element);
  }
}

function clearMorph(named: HTMLElement[]) {
  for (const element of named.splice(0)) element.style.viewTransitionName = "";
}

let current = 0;

/**
 * Commits `next` with a direction-aware view transition when the browser
 * supports one and the user hasn't asked for reduced motion; otherwise
 * commits directly, exactly as before.
 */
export function transitionRoute(prev: LocalRoute, next: LocalRoute, commit: () => void): void {
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion() || sameRoute(prev, next)) {
    commit();
    return;
  }

  const token = ++current;
  const root = document.documentElement;
  const morph = morphRecipeId(prev, next);
  const named: HTMLElement[] = [];
  root.dataset.navDirection = navDirection(prev, next);
  if (morph) nameMorph(morph.from === "card" ? findCard(morph.id) : findDetail(morph.id), named);

  const transition = document.startViewTransition(() => {
    // The old screen is gone after the commit; its names were already captured.
    flushSync(commit);
    clearMorph(named);
    if (morph) nameMorph(morph.from === "card" ? findDetail(morph.id) : findCard(morph.id), named);
  });

  const cleanup = () => {
    clearMorph(named);
    if (token === current) delete root.dataset.navDirection;
  };
  transition.finished.then(cleanup, cleanup);
}
