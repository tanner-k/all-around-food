"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Plus, Settings } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { localHref, parseLocalRoute } from "@/lib/local/navigation";

const COOK_ROUTE = /^\/cookbook\/[^/]+\/cook(\/|$)/;

/** Current `location.hash`, kept in sync with `hashchange`. Empty on the server. */
export function useLocationHash() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
}

/** True on cook mode: the legacy `/cookbook/:id/cook` path or `/app#/cookbook/:id/cook`. */
export function useIsCookRoute() {
  const pathname = usePathname() ?? "";
  const hash = useLocationHash();
  if (COOK_ROUTE.test(pathname)) return true;
  return pathname === "/app" && parseLocalRoute(hash).view === "cook";
}

type Section = "plan" | "cookbook" | "shop" | "pantry";

const navLinks: { label: string; section: Section }[] = [
  { label: "Plan", section: "plan" },
  { label: "Cookbook", section: "cookbook" },
  { label: "Shop", section: "shop" },
  { label: "Pantry", section: "pantry" },
];

/** Same classes as IconButton's ghost variant, applied to a real link. */
const iconLinkClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink active:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Hash navigation on /app; a full load from any other page. */
function navigate(href: string) {
  window.location.assign(href);
}

export function AppHeader() {
  const pathname = usePathname() ?? "";
  const hash = useLocationHash();
  const isCook = useIsCookRoute();
  const view = pathname === "/app" ? parseLocalRoute(hash).view : null;
  const activeSection: Section | null =
    view === "recipe" || view === "edit"
      ? "cookbook"
      : view === "plan" || view === "cookbook" || view === "shop" || view === "pantry"
        ? view
        : null;
  const onSettings = view === "settings";

  return (
    // Hidden (not unmounted) on cook routes so #app-header-status stays the
    // same DOM node that LocalApp portals its sync chip into.
    <header
      hidden={isCook}
      className="border-b border-line bg-bg pt-[env(safe-area-inset-top)]"
    >
      <nav className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2 md:gap-8 md:px-14 md:py-3">
        {/* Brand mark */}
        <a
          href="/app#/plan"
          className="font-serif italic text-xl text-terra tracking-tight shrink-0"
        >
          All Around Food
        </a>
        {/* Sync status slot: LocalApp portals its chip here on /app screens */}
        <span id="app-header-status" className="flex min-w-0 md:-ml-5" />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Desktop section links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navLinks.map(({ label, section }) => {
            const active = activeSection === section;
            return (
              <a
                key={section}
                href={localHref(section)}
                aria-current={active ? "page" : undefined}
                className={`transition-colors hover:text-ink ${active ? "text-ink" : "text-ink-soft"}`}
              >
                {label}
              </a>
            );
          })}
        </div>

        {/* Header actions, visible at every breakpoint */}
        <div className="-mr-2 flex items-center gap-1">
          <Menu
            label="Add or import a recipe"
            trigger={<Plus size={22} />}
            align="end"
            items={[
              { label: "Add recipe", onSelect: () => navigate(localHref("edit")) },
              { label: "Import recipe", onSelect: () => navigate(localHref("import")) },
            ]}
          />
          <a
            href={localHref("settings")}
            aria-label="Settings"
            aria-current={onSettings ? "page" : undefined}
            className={iconLinkClass}
          >
            <Settings size={22} aria-hidden="true" />
          </a>
        </div>
      </nav>
    </header>
  );
}

export function AppMain({ children }: { children: ReactNode }) {
  const isCook = useIsCookRoute();
  return (
    <main
      className={
        isCook
          ? // Header is hidden in cook mode, so content clears the status bar itself.
            "w-full max-w-none p-0"
          : "mx-auto w-full max-w-[1400px] px-4 py-16 pb-[calc(var(--tabbar-height)+1.5rem)] md:px-14 md:pb-24"
      }
    >
      {children}
    </main>
  );
}
