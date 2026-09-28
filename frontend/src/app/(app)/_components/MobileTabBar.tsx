"use client";

import { usePathname } from "next/navigation";
import { BookOpen, Package, CalendarDays, ShoppingBasket, type LucideIcon } from "lucide-react";
import { localHref, parseLocalRoute } from "@/lib/local/navigation";
import { useIsCookRoute, useLocationHash } from "./AppHeader";

type Tab = { href: string; label: string; Icon: LucideIcon };

// Import and Settings live in the header (plan 07); the bar keeps the four destinations.
const TABS: Tab[] = [
  { href: localHref("plan"), label: "Plan", Icon: CalendarDays },
  { href: localHref("cookbook"), label: "Cookbook", Icon: BookOpen },
  { href: localHref("shop"), label: "Shop", Icon: ShoppingBasket },
  { href: localHref("pantry"), label: "Pantry", Icon: Package },
];

export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const hash = useLocationHash();
  const isCook = useIsCookRoute();
  if (isCook || pathname !== "/app") return null;
  const view = parseLocalRoute(hash).view;

  return (
    <nav
      aria-label="Mobile navigation"
      data-mobile-tabbar=""
      className="fixed inset-x-0 bottom-0 z-50 h-(--tabbar-height) border-t border-line bg-paper/80 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid h-full grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const tabView = parseLocalRoute(href.split("#")[1]).view;
          const active = view === tabView || (tabView === "cookbook" && ["recipe", "edit"].includes(view));
          return (
            <li key={href}>
              <a
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "font-semibold text-terra-strong" : "text-ink-soft hover:text-ink active:text-ink"
                }`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? "bg-terra-soft" : ""}`}
                >
                  {/* A translucent currentColor fill weights the active icon while
                      keeping interior strokes (calendar dots, basket slats, box seams)
                      visible; a solid fill in the stroke color would blot them out. */}
                  <Icon
                    size={22}
                    aria-hidden="true"
                    fill={active ? "currentColor" : "none"}
                    fillOpacity={active ? 0.25 : undefined}
                    strokeWidth={active ? 2.25 : 2}
                  />
                </span>
                <span>{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileTabBar;
