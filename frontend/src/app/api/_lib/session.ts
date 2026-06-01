import { auth } from "@/auth";

/**
 * Returns the authenticated user's id, or null when there is no valid session.
 * User-scoped route handlers must treat null as 401.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
