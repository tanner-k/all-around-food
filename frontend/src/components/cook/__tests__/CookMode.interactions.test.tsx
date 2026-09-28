import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import type { CookProgress, CookProgressPatch } from "@/lib/local/schema";
import { CookMode } from "../CookMode";

function setup(overrides: Partial<CookProgress> = {}) {
  const recipe = recipeFixture();
  recipe.steps = [0, 1, 2].map((index) => ({
    order: index + 1, instruction: `Step ${index + 1}`, duration_min: null,
    temperature_f: null, equipment: [], inline_amounts: [],
  }));
  const progress: CookProgress = { recipe_id: recipe.id, step: 0, layout: "step", timer_end_at: null, paused_seconds: null, session_id: "session-1", completed_at: null, ...overrides };
  const onSaveProgress = vi.fn(async (value: CookProgressPatch) => { void value; });
  const view = render(<CookMode recipe={recipe} progress={progress} pantry={[]} onSaveProgress={onSaveProgress}
    onComplete={async () => true} onSetPantryStatus={async () => undefined} />);
  return { ...view, onSaveProgress };
}

function mockWakeLock(request: () => Promise<WakeLockSentinel>) {
  const wakeLock = { request: vi.fn(request) };
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: wakeLock });
  return wakeLock;
}

function fakeSentinel() {
  const target = new EventTarget() as WakeLockSentinel & EventTarget;
  const release = vi.fn(async () => { target.dispatchEvent(new Event("release")); });
  Object.assign(target, { released: false, type: "screen", release });
  return target;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
  delete document.body.dataset.cookTheme;
});

it("moves between steps with the arrow keys without finishing", () => {
  const { onSaveProgress } = setup();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  expect(onSaveProgress).toHaveBeenLastCalledWith(expect.objectContaining({ step: 1 }));
});

it("ignores arrow keys in scroll layout, with modifiers, and while a sheet is open", () => {
  setup({ layout: "scroll" });
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Step" }));
  fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Show ingredients" }));
  expect(screen.getByRole("dialog", { name: "Ingredients" })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
});

it("changes steps on a horizontal swipe but not a vertical scroll", () => {
  setup();
  const content = screen.getAllByText("Step 1")[0].closest(".overflow-y-auto") as HTMLElement;
  const swipe = (from: [number, number], to: [number, number]) => {
    fireEvent.touchStart(content, { touches: [{ clientX: from[0], clientY: from[1] }] });
    fireEvent.touchEnd(content, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
  };
  swipe([300, 400], [100, 410]);
  expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  swipe([200, 100], [140, 400]);
  expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  swipe([100, 400], [300, 390]);
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
});

it("shows the screen-on pill only while the wake lock is held, and releases it on completion", async () => {
  const sentinel = fakeSentinel();
  const wakeLock = mockWakeLock(async () => sentinel);
  setup({ step: 2 });
  expect(await screen.findAllByText("Screen stays on")).toHaveLength(2);
  expect(wakeLock.request).toHaveBeenCalledWith("screen");

  fireEvent.click(screen.getAllByRole("button", { name: /Finish/ })[0]);
  expect(await screen.findByText("Mark as cooked")).toBeInTheDocument();
  await waitFor(() => expect(sentinel.release).toHaveBeenCalled());
  expect(screen.queryByText("Screen stays on")).not.toBeInTheDocument();
});

it("retries a rejected wake lock on the next tap", async () => {
  const sentinel = fakeSentinel();
  let calls = 0;
  const wakeLock = mockWakeLock(async () => {
    calls += 1;
    if (calls === 1) throw new DOMException("No activation", "NotAllowedError");
    return sentinel;
  });
  setup();
  await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(screen.queryByText("Screen stays on")).not.toBeInTheDocument();

  fireEvent.pointerDown(screen.getAllByText("Step 1")[0]);
  expect(await screen.findAllByText("Screen stays on")).toHaveLength(2);
  expect(wakeLock.request).toHaveBeenCalledTimes(2);
});

it("toggles the session-only dark kitchen presentation without saving progress", () => {
  const { container, onSaveProgress, unmount } = setup();
  const root = container.querySelector("[data-cook-root]") as HTMLElement;
  expect(root).not.toHaveAttribute("data-cook-theme");

  const [toggle] = screen.getAllByRole("button", { name: "Dark kitchen mode" });
  fireEvent.click(toggle);
  expect(root).toHaveAttribute("data-cook-theme", "dark");
  expect(document.body.dataset.cookTheme).toBe("dark");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(onSaveProgress).not.toHaveBeenCalled();

  unmount();
  expect(document.body.dataset.cookTheme).toBeUndefined();
});

it("shows one running timer pill per layout that opens the timer sheet on mobile", async () => {
  setup({ timer_end_at: Date.now() + 90_000 });
  const open = await screen.findByRole("button", { name: "Open timer" });
  expect(screen.getByRole("group", { name: "Timer" })).toBeInTheDocument();
  fireEvent.click(open);
  expect(screen.getByRole("dialog", { name: "Timer" })).toBeInTheDocument();
});
