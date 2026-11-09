import { useState, type CSSProperties } from "react";
import type { Recipe } from "@/lib/recipe-schema";
import { localHref } from "@/lib/local/navigation";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function initialFor(title: string) {
  const initial = title
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : "#";
}

export function CookbookList({ recipes }: { recipes: Recipe[] }) {
  const sorted = [...recipes].sort((a, b) =>
    a.title.trim().localeCompare(b.title.trim(), "en", {
      sensitivity: "base",
      numeric: true,
    }),
  );
  const indexes = new Map(sorted.map((recipe, index) => [recipe.id, index]));
  const [stagger] = useState(() => typeof document === "undefined" || document.documentElement.dataset.navDirection !== "pop");
  const groups = new Map<string, Recipe[]>();
  for (const recipe of sorted) {
    const letter = initialFor(recipe.title);
    const group = groups.get(letter);
    if (group) group.push(recipe);
    else groups.set(letter, [recipe]);
  }
  const available = [
    ...LETTERS.filter((letter) => groups.has(letter)),
    ...(groups.has("#") ? ["#"] : []),
  ];

  function scrollToLetter(letter: string) {
    document
      .getElementById(`recipe-letter-${letter}`)
      ?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="flex items-start gap-3 sm:gap-6">
      <div className="min-w-0 flex-1">
        {available.map((letter) => (
          <section
            key={letter}
            aria-labelledby={`recipe-letter-${letter}`}
            className="mb-8"
          >
            <h2
              id={`recipe-letter-${letter}`}
              className="scroll-mt-24 border-b border-line pb-2 font-serif text-2xl text-ink"
            >
              {letter}
            </h2>
            <ul>
              {groups.get(letter)?.map((recipe) => (
                <li
                  key={recipe.id}
                  className="flex items-center justify-between gap-2 border-b border-line/60 py-3 sm:gap-4"
                  data-stagger={stagger ? "" : undefined}
                  style={stagger ? { "--stagger-index": indexes.get(recipe.id) } as CSSProperties : undefined}
                >
                  <a
                    href={localHref("recipe", recipe.id)}
                    data-recipe-card={recipe.id}
                    className="min-w-0 break-words [overflow-wrap:anywhere] font-serif text-lg text-ink hover:text-terra-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span data-recipe-title="">{recipe.title.trim()}</span>
                  </a>
                  <div className="flex shrink-0 items-center gap-1 sm:gap-4">
                    <span className="whitespace-nowrap text-sm text-ink-mute">
                      {recipe.times_made} made
                    </span>
                    <a
                      href={localHref("edit", recipe.id)}
                      aria-label={`Edit ${recipe.title.trim()}`}
                      className="rounded-control px-2 py-1 text-sm text-terra-strong underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      Edit
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <nav
        aria-label="Cookbook letters"
        className="sticky top-24 max-h-[calc(100dvh-11rem)] shrink-0 overflow-y-auto rounded-control border border-line bg-paper p-1 md:max-h-[calc(100dvh-7rem)]"
      >
        <ul className="flex flex-col items-center">
          {LETTERS.map((letter) => (
            <li key={letter}>
              {groups.has(letter) ? (
                <button
                  type="button"
                  onClick={() => scrollToLetter(letter)}
                  aria-label={`Jump to ${letter}`}
                  className="flex min-h-8 min-w-8 items-center justify-center rounded-control text-sm text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  {letter}
                </button>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex min-h-8 min-w-8 items-center justify-center rounded-control text-sm text-ink-mute/50"
                >
                  {letter}
                </span>
              )}
            </li>
          ))}
          {groups.has("#") && (
            <li>
              <button
                type="button"
                onClick={() => scrollToLetter("#")}
                aria-label="Jump to #"
                className="flex min-h-8 min-w-8 items-center justify-center rounded-control text-sm text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                #
              </button>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
