/**
 * Next.js middleware — delegates auth to Auth.js.
 *
 * The `auth` export from `@/auth` is used directly as the middleware function.
 * The `authorized` callback in `src/auth.ts` controls which requests are
 * allowed through.
 *
 * Matcher: protects all (app) route-group pages.
 * Excludes:
 *  - /api/auth/* — Auth.js route handler (must be public)
 *  - /signin      — sign-in page (must be public)
 *  - /_next/*     — Next.js internals
 *  - /favicon.ico — static asset
 *  - Files with extensions (e.g. .js, .css, .svg, .png)
 */
export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - /api/auth/* (Auth.js handlers)
     *   - /signin
     *   - /_next/* (Next.js internals + static files)
     *   - /favicon.ico
     *   - Any path that contains a dot (static assets like .js, .css, .png, .svg)
     */
    "/((?!api/auth|signin|_next|favicon\\.ico|.*\\..*).*)",
  ],
};
