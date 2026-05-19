import type { Metadata } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "All Around Food",
  description:
    "A planner-first cooking app — weekly meal planning, AI recipe import, smart shopping list, pantry inventory, and hands-on cook mode.",
};

const navLinks = [
  { label: "Plan", href: "/plan" },
  { label: "Cookbook", href: "/cookbook" },
  { label: "Shop", href: "/shop" },
  { label: "Pantry", href: "/pantry" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${manrope.variable}`}
    >
      <body>
        {/* ── Top navigation ────────────────────────────────────── */}
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-[1400px] items-center gap-8 px-14 py-4">
            {/* Brand mark */}
            <Link
              href="/plan"
              className="font-serif italic text-xl text-terra tracking-tight shrink-0"
            >
              All Around Food
            </Link>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Nav items */}
            <div className="flex items-center gap-6 text-sm font-medium">
              {navLinks.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-ink-soft transition-colors hover:text-ink"
                >
                  {label}
                </Link>
              ))}

              {/* + Import — terracotta pill accent */}
              <Link
                href="/import"
                className="rounded-full bg-terra-soft px-3 py-1 text-terra transition-colors hover:bg-terra hover:text-paper"
              >
                + Import
              </Link>
            </div>
          </nav>
        </header>

        {/* ── Page container ────────────────────────────────────── */}
        <main className="mx-auto w-full max-w-[1400px] px-14 py-16 pb-24">
          {children}
        </main>
      </body>
    </html>
  );
}
