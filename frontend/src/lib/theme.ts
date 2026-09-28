/**
 * Canonical color literals for places that cannot read CSS custom properties
 * (Next's `viewport.themeColor`, SVG chart attributes). This is the only file
 * the ESLint hex guard allows to hold raw hex values; everything else styles
 * from the tokens in `app/globals.css`.
 */

/** Must equal `--color-terra` in `app/globals.css` (asserted by a unit test). */
export const TERRA_HEX = "#C2613B";

/** Legacy `/prices` chart colors (Recharts needs literal SVG colors). */
export const PRICE_CHART_STORE_COLORS: Record<string, string> = {
  kroger: "#C25A30",
  walmart: "#0071CE",
  costco: "#E31837",
  wholefoods: "#00674B",
  instacart: "#43B02A",
  ubereats: "#06C167",
  default0: "#7C6AF5",
  default1: "#F5A623",
};
export const PRICE_CHART_FALLBACK_COLOR = "#888888";
export const PRICE_CHART_GRID = "#e5e1db";
export const PRICE_CHART_TICK = "#9E8E82";
export const PRICE_CHART_LABEL = "#3D2B1F";
export const PRICE_CHART_TOOLTIP_BORDER = "#E5E1DB";
export const PRICE_CHART_TOOLTIP_BG = "#FDFBF8";
