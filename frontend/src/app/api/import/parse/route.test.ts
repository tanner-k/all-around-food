import { expect, it } from "vitest";
import { POST } from "./route";

it("retires direct browser recipe parsing without inspecting the body", async () => {
  const response = await POST();
  expect(response.status).toBe(410);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: expect.stringMatching(/local import queue/i) });
});
