/**
 * Central safe-error helper for API routes.
 *
 * SECURITY contract:
 * - Stack traces are NEVER included in responses.
 * - Environment variable values (including API keys) are never echoed.
 * - Only a generic human-readable message + a stable error code are returned.
 * - The real error (with full stack/context) is logged server-side via
 *   console.error so it shows up in Vercel function logs without leaking to
 *   the client.
 */

import { NextResponse } from "next/server";

export interface SafeErrorOptions {
  /**
   * Prefix shown in the server log — e.g. "[api/recipes/import]".
   * Helps grep logs for a specific route without the context leaking to
   * the response body.
   */
  context: string;
  /**
   * Stable machine-readable code included in the JSON response so that
   * clients / tests can identify the error class without parsing the message.
   */
  code?: string;
  /**
   * Human-readable message sent to the client.
   * Must NOT include internal paths, env values, or stack frames.
   * Defaults to a generic "An unexpected error occurred."
   */
  message?: string;
  /** HTTP status to return. Defaults to 500. */
  status?: number;
}

/**
 * Log the real error server-side and return a safe NextResponse JSON body.
 *
 * Usage inside a route catch block:
 *
 * ```ts
 * } catch (err) {
 *   return toSafeErrorResponse(err, {
 *     context: "[api/recipes/import]",
 *     code: "IMPORT_ERROR",
 *   });
 * }
 * ```
 */
export function toSafeErrorResponse(
  err: unknown,
  options: SafeErrorOptions,
): NextResponse {
  const {
    context,
    code = "INTERNAL_ERROR",
    message = "An unexpected error occurred. Please try again.",
    status = 500,
  } = options;

  // Log the full error server-side (visible in Vercel function logs).
  // We deliberately log the raw err — stack trace and all — so developers can
  // debug. This line MUST NOT be removed; it is the only place the real error
  // surfaces.
  console.error(`${context} Unhandled error [${code}]:`, err);

  // Return a body that is safe to expose to any client — no internals, no env.
  return NextResponse.json({ error: message, code }, { status });
}
