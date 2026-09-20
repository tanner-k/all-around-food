import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn(async () => new Response("online")) }));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession }));
import { middleware } from "./middleware";

it("does not call auth for local shell or assets", async () => {
  for (const path of ["/app", "/app/", "/assets/offline.png"]) {
    const response = await middleware(new NextRequest(`https://food.example${path}`));
    expect(response.status).toBe(200);
  }
  expect(updateSession).not.toHaveBeenCalled();
});

it("keeps the online export behind auth middleware", async () => {
  await middleware(new NextRequest("https://food.example/api/export"));
  expect(updateSession).toHaveBeenCalledTimes(1);
});
