import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "./route";

it("returns successful sign-in to the local import view", async () => {
  const response = await GET(new NextRequest("https://food.example/auth/confirm?code=one"));
  expect(response.headers.get("location")).toBe("https://food.example/app#/import");
});

it("rejects a cross-origin auth return URL", async () => {
  const response = await GET(new NextRequest("https://food.example/auth/confirm?code=one&next=https%3A%2F%2Fevil.example%2F"));
  expect(response.headers.get("location")).toBe("https://food.example/app#/import");
});

it("allows a same-origin auth return URL", async () => {
  const response = await GET(new NextRequest("https://food.example/auth/confirm?code=one&next=%2Fapp%23%2Fsettings"));
  expect(response.headers.get("location")).toBe("https://food.example/app#/settings");
});
