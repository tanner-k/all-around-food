export type LocalRoute =
  | { view: "plan"; weekOf?: string }
  | { view: "cookbook" | "shop" | "pantry" | "import" | "settings" }
  | { view: "recipe" | "edit" | "cook"; recipeId: string | null };

export function localHref(view: LocalRoute["view"], id?: string): string {
  if (view === "recipe" || view === "edit" || view === "cook") {
    if (view === "edit" && !id) return "/app#/cookbook/new";
    const root = `/app#/cookbook/${id === "new" ? "%6Eew" : id ? encodeURIComponent(id) : "new"}`;
    return view === "recipe" ? root : `${root}/${view}`;
  }
  if (view === "plan") return `/app#/plan${id ? `?weekOf=${encodeURIComponent(id)}` : ""}`;
  return `/app#/${view}`;
}

export function parseLocalRoute(hash: string): LocalRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const [pathname, search = ""] = raw.split("?");
  if (pathname === "/plan" || pathname === "" || pathname === "/") {
    const weekOf = new URLSearchParams(search).get("weekOf");
    return weekOf && /^\d{4}-\d{2}-\d{2}$/.test(weekOf)
      ? { view: "plan", weekOf }
      : { view: "plan" };
  }
  if (["/cookbook", "/shop", "/pantry", "/import", "/settings"].includes(pathname)) {
    return { view: pathname.slice(1) as "cookbook" | "shop" | "pantry" | "import" | "settings" };
  }
  if (pathname === "/cookbook/new") return { view: "edit", recipeId: null };
  const match = /^\/cookbook\/([^/]+)(?:\/(edit|cook))?$/.exec(pathname);
  if (match) {
    try {
      const recipeId = decodeURIComponent(match[1]);
      if (recipeId) return { view: (match[2] as "edit" | "cook" | undefined) ?? "recipe", recipeId };
    } catch {
      return { view: "cookbook" };
    }
  }
  return pathname.startsWith("/cookbook/") ? { view: "cookbook" } : { view: "plan" };
}
