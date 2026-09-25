import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import { MobileTabBar } from "@/app/(app)/_components/MobileTabBar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "All Around Food",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#C2613B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const navLinks = [
  { label: "Plan", href: "/app#/plan" },
  { label: "Cookbook", href: "/app#/cookbook" },
  { label: "Shop", href: "/app#/shop" },
  { label: "Pantry", href: "/app#/pantry" },
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
          <nav className="mx-auto flex max-w-[1400px] items-center gap-8 px-4 md:px-14 py-4">
            {/* Brand mark */}
            <a
              href="/app#/plan"
              className="font-serif italic text-xl text-terra tracking-tight shrink-0"
            >
              All Around Food
            </a>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Nav items */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              {navLinks.map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  className="text-ink-soft transition-colors hover:text-ink"
                >
                  {label}
                </a>
              ))}

              {/* + Import — terracotta pill accent */}
              <a
                href="/app#/import"
                className="rounded-full bg-terra-soft px-3 py-1 text-terra transition-colors hover:bg-terra hover:text-paper"
              >
                + Import
              </a>
              <a href="/app#/settings" className="text-ink-soft transition-colors hover:text-ink">Settings</a>
            </div>
          </nav>
        </header>

        {/* ── Page container ────────────────────────────────────── */}
        <main className="mx-auto w-full max-w-[1400px] px-4 md:px-14 py-16 pb-20 md:pb-24">
          {children}
        </main>
        <MobileTabBar />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
