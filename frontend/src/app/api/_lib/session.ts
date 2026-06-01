// TODO(T3-integration): replace body with the real Auth.js session lookup:
//   import { auth } from "@/auth"; const s = await auth(); return s?.user?.id ?? null;
// Until auth is wired, return a fixed dev user id so user-scoped handlers compile & run.

export const DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function getCurrentUserId(): Promise<string | null> {
  return DEV_USER_ID;
}
