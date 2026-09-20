import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn(async () => new Response("online")) }));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession }));
import { middleware } from "./middleware";

beforeEach(() => updateSession.mockClear());

it("does not call auth for local shell, cookbook redirects, or assets", async () => {
  for (const path of ["/app", "/app/", "/assets/offline.png", "/cookbook", "/cookbook/recipe-1", "/cookbook/recipe-1/cook"]) {
    const response = await middleware(new NextRequest(`https://food.example${path}`));
    expect(response.status).toBe(200);
  }
  expect(updateSession).not.toHaveBeenCalled();
});

it("opens the local root and legacy planning routes without a session", async () => {
  for (const path of ["/", "/plan", "/shop", "/pantry"]) {
    const response = await middleware(new NextRequest(`https://food.example${path}`));
    expect(response.status).toBe(200);
  }
  expect(updateSession).not.toHaveBeenCalled();
});

it("keeps the online export behind auth middleware", async () => {
  await middleware(new NextRequest("https://food.example/api/export"));
  expect(updateSession).toHaveBeenCalledTimes(1);
});
