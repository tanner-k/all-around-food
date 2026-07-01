/**
 * Client-side store of recently-used text-message recipients.
 *
 * Kept in localStorage (most-recent-first, capped) so the user can re-send a
 * shopping list to a number they've used before without retyping it. Backend
 * stays stateless — these numbers never leave the browser.
 */

const STORAGE_KEY = "aaf.sms.recipients";
const MAX_RECIPIENTS = 5;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is string => typeof n === "string");
  } catch {
    return [];
  }
}

/** Return remembered recipient numbers, most-recently-used first. */
export function getRememberedRecipients(): string[] {
  return read();
}

/**
 * Record a successfully-used number, moving it to the front and trimming the
 * list to the maximum size. Returns the updated list.
 */
export function rememberRecipient(number: string): string[] {
  const trimmed = number.trim();
  if (!trimmed) return read();
  const next = [trimmed, ...read().filter((n) => n !== trimmed)].slice(
    0,
    MAX_RECIPIENTS
  );
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / unavailable storage — remembering is best-effort.
  }
  return next;
}
