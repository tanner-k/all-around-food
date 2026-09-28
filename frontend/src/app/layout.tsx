import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import { AppHeader, AppMain } from "@/app/(app)/_components/AppHeader";
import { MobileTabBar } from "@/app/(app)/_components/MobileTabBar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { TERRA_HEX, THEME_COLOR_DARK_HEX } from "@/lib/theme";
import { themeInitScript } from "@/lib/theme-preference";
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
    // Cream header runs under the status bar; AppHeader pads for safe-area-inset-top.
    statusBarStyle: "black-translucent",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: TERRA_HEX },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK_HEX },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${manrope.variable}`}
      // The head script sets data-theme before hydration, so the server HTML differs.
      suppressHydrationWarning
    >
      <head>
        {/* Resolve the Light/Dark/System preference before first paint.
            No Content-Security-Policy is sent today; if one is added, this
            inline script needs a nonce or hash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body>
        {/* Status-bar scrim: 0px tall in browsers. On an installed iPhone
            (black-translucent status bar) it keeps scrolled content from
            showing through behind the clock and battery. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[env(safe-area-inset-top)] bg-bg/85 backdrop-blur"
        />
        <AppHeader />
        <AppMain>{children}</AppMain>
        <MobileTabBar />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
