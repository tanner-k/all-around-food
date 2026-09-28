import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ServiceWorkerRegister from "../ServiceWorkerRegister";

const mocks = vi.hoisted(() => ({ pathname: vi.fn(), readSnapshot: vi.fn(), subscribe: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname() }));
vi.mock("@/lib/local/repository", () => ({ readSnapshot: mocks.readSnapshot, saveSetting: vi.fn(), subscribeToLocalChanges: mocks.subscribe }));

// An active worker that answers CHECK_READY with PWA_READY, so the "Offline ready" note would show.
const active = {
  postMessage: (_message: unknown, ports: MessagePort[]) => ports[0].postMessage({ type: "PWA_READY", ready: true, buildId: "b1" }),
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  mocks.pathname.mockReturnValue("/app");
  mocks.subscribe.mockReturnValue(vi.fn());
  vi.stubGlobal("navigator", { serviceWorker: { controller: active, register: vi.fn().mockResolvedValue({ addEventListener: vi.fn(), removeEventListener: vi.fn(), update: vi.fn().mockResolvedValue(undefined) }), ready: Promise.resolve({ active }), addEventListener: vi.fn(), removeEventListener: vi.fn() } });
  Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.location.hash = ""; });

it("shows the Offline ready note outside cook mode", async () => {
  window.location.hash = "#/cookbook";
  render(<ServiceWorkerRegister />);
  expect(await screen.findByRole("status", { name: "Offline ready" })).toBeInTheDocument();
});

it("hides the Offline ready note and renders nothing else on a cook hash", async () => {
  window.location.hash = "#/cookbook/abc123/cook";
  const { container } = render(<ServiceWorkerRegister />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  expect(screen.queryByRole("status", { name: "Offline ready" })).not.toBeInTheDocument();
  expect(container).toBeEmptyDOMElement();
});
