"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Package, Tag, Plus, type LucideIcon } from "lucide-react";

type Tab = { href: string; label: string; Icon: LucideIcon };

const TABS: Tab[] = [
  { href: "/cookbook", label: "Cookbook", Icon: BookOpen },
  { href: "/pantry",   label: "Pantry",   Icon: Package },
  { href: "/prices",   label: "Prices",   Icon: Tag },
  { href: "/import",   label: "Import",   Icon: Plus },
];

const COOK_ROUTE = /^\/cookbook\/[^/]+\/cook(\/|$)/;

export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  if (COOK_ROUTE.test(pathname)) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-50 md:hidden border-t border-line bg-paper/80 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "text-terra" : "text-ink-soft hover:text-ink active:text-ink"
                }`}
              >
                <Icon size={22} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileTabBar;
