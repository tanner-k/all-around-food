/**
 * Normalize an ingredient or item name for matching. Mirrors the backend's
 * `normalize_name` (lowercase, trim, collapse internal whitespace) so the
 * frontend can match recipe ingredients against stored pantry items.
 */
export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
