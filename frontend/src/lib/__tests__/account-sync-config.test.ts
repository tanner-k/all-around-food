import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it.each([
  { vercel: undefined, explicit: undefined, expected: "off" },
  { vercel: "1", explicit: undefined, expected: "recipes" },
  { vercel: "1", explicit: "off", expected: "off" },
])("sets stage $expected for Vercel=$vercel and override=$explicit", async ({ vercel, explicit, expected }) => {
 vi.stubEnv("VERCEL", vercel); vi.stubEnv("NEXT_PUBLIC_ACCOUNT_SYNC_STAGE", explicit); vi.resetModules();
 const { default: config } = await import("../../../next.config");
 expect(config.env?.NEXT_PUBLIC_ACCOUNT_SYNC_STAGE).toBe(expected);
});
