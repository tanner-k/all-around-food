/**
 * Auth.js (NextAuth v5) configuration.
 *
 * IMPORTANT: This file must never call any env accessor at module top-level.
 * All env reads are deferred to request time (inside callbacks/config) so that
 * `pnpm build` succeeds without secrets present in the build environment.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db/client";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  authenticators,
} from "@/db/schema";
import { getAllowedEmails } from "@/lib/env";

// ---------------------------------------------------------------------------
// Pure helper — no env access, safe to call anywhere including tests.
// ---------------------------------------------------------------------------

/**
 * Returns true when `email` is in `allowed` (case-insensitive).
 * An absent/empty email always returns false.
 * An empty allowlist always returns false (deny-by-default).
 */
export function isEmailAllowed(
  email: string | null | undefined,
  allowed: string[],
): boolean {
  if (!email) return false;
  if (allowed.length === 0) return false;
  const normalised = email.trim().toLowerCase();
  return allowed.some((a) => a.trim().toLowerCase() === normalised);
}

// ---------------------------------------------------------------------------
// NextAuth initialisation
// ---------------------------------------------------------------------------

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Adapter: uses the Drizzle tables defined in src/db/schema.ts.
  // The db client is lazy (no connection until first query), so importing this
  // file at build time does not throw even when DATABASE_URL is unset.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),

  // Providers — no explicit clientId/secret: Auth.js v5 auto-reads
  // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET from the environment
  // at request time, keeping this import build-safe.
  providers: [Google],

  // Custom pages
  pages: {
    signIn: "/signin",
  },

  callbacks: {
    /**
     * Gate sign-in to the email allowlist.
     * `getAllowedEmails()` is called here (request-time), never at module load.
     */
    signIn({ user }) {
      return isEmailAllowed(user.email, getAllowedEmails());
    },

    /**
     * Drive middleware redirects.
     * Allow the /signin path through; all other routes require a session.
     */
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/signin")) return true;
      return !!session?.user;
    },

    /**
     * Attach the database user id to the session object.
     * The Drizzle adapter uses the database session strategy by default, so
     * the `user` argument (AdapterUser) is always present here.
     */
    session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
