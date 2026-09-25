"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Package, CalendarDays, ShoppingBasket, Plus, type LucideIcon } from "lucide-react";
import { localHref, parseLocalRoute } from "@/lib/local/navigation";

type Tab = { href: string; label: string; Icon: LucideIcon };

const TABS: Tab[] = [
  { href: localHref("plan"), label: "Plan", Icon: CalendarDays },
  { href: localHref("cookbook"), label: "Cookbook", Icon: BookOpen },
  { href: localHref("shop"), label: "Shop", Icon: ShoppingBasket },
  { href: localHref("pantry"), label: "Pantry", Icon: Package },
  { href: localHref("import"), label: "Import", Icon: Plus },
];

const COOK_ROUTE = /^\/cookbook\/[^/]+\/cook(\/|$)/;

export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (COOK_ROUTE.test(pathname)) return null;
  if (pathname !== "/app") return null;
  const view = parseLocalRoute(hash).view;
  if (view === "cook") return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-50 md:hidden border-t border-line bg-paper/80 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const tabView = parseLocalRoute(href.split("#")[1]).view;
          const active = view === tabView || (tabView === "cookbook" && ["recipe", "edit"].includes(view));
          return (
            <li key={href}>
              <a
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "text-terra" : "text-ink-soft hover:text-ink active:text-ink"
                }`}
              >
                <Icon size={22} aria-hidden="true" />
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
