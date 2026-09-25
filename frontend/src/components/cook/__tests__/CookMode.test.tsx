import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import type { CookProgress, CookProgressPatch } from "@/lib/local/schema";
import { CookMode } from "../CookMode";
import { beginCookSession, readSnapshot, saveCookProgress } from "@/lib/local/repository";
import { closeLocalDB } from "@/lib/local/db";

it("preserves simultaneous step and timer actions from two views with stale snapshots", async () => {
  const recipe = recipeFixture();
  recipe.id = "concurrent-cook-views";
  recipe.steps = [0, 1].map((index) => ({
    order: index + 1, instruction: `Step ${index + 1}`, duration_min: 1,
    temperature_f: null, equipment: [], inline_amounts: [],
  }));
  const progress = await beginCookSession(recipe.id);
  const writes: Promise<void>[] = [];
  const onSaveProgress = (update: Parameters<typeof saveCookProgress>[0]) => {
    const write = saveCookProgress(update);
    writes.push(write);
    return write;
  };
  const props = { recipe, progress, pantry: [], onSaveProgress,
    onComplete: async () => true, onSetPantryStatus: async () => undefined };
  const rendered = render(<>
    <div data-testid="first-view"><CookMode {...props} /></div>
    <div data-testid="second-view"><CookMode {...props} /></div>
  </>);
  try {
    // Both actions use the same initial snapshot, before either view refreshes.
    fireEvent.click(within(screen.getByTestId("first-view")).getAllByRole("button", { name: /Next/ })[0]);
    fireEvent.click(within(screen.getByTestId("second-view")).getAllByRole("button", { name: /Start 1 min timer/ })[0]);
    await act(async () => { await Promise.all(writes); });
    expect(writes).toHaveLength(2);
    const saved = (await readSnapshot()).cook_progress.find((row) => row.recipe_id === recipe.id);
    expect(saved).toMatchObject({ step: 1, timer_end_at: expect.any(Number), paused_seconds: null });
  } finally {
    rendered.unmount();
    await closeLocalDB();
  }
});

it("persists step, layout, timer deadline, and paused seconds", async () => {
  const recipe = recipeFixture();
  recipe.steps[0].duration_min = 1;
  const progress: CookProgress = { recipe_id: recipe.id, step: 0, layout: "step", timer_end_at: null, paused_seconds: null, session_id: "session-1", completed_at: null };
  const onSaveProgress = vi.fn(async (value: CookProgressPatch) => { void value; });
  render(<CookMode recipe={recipe} progress={progress} pantry={[]} onSaveProgress={onSaveProgress}
    onComplete={async () => true} onSetPantryStatus={async () => undefined} />);

  fireEvent.click(screen.getByRole("button", { name: "Scroll" }));
  await waitFor(() => expect(onSaveProgress).toHaveBeenCalledWith(expect.objectContaining({ layout: "scroll" })));
  fireEvent.click(screen.getByRole("button", { name: "Step" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Start 1 min timer/ })[0]);
  await waitFor(() => expect(onSaveProgress).toHaveBeenCalledWith(expect.objectContaining({ timer_end_at: expect.any(Number) })));
  const withDeadline = onSaveProgress.mock.lastCall?.[0];
  expect(withDeadline?.timer_end_at).toBeGreaterThan(Date.now());

  fireEvent.click(screen.getByRole("button", { name: "Pause timer" }));
  await waitFor(() => expect(onSaveProgress).toHaveBeenCalledWith(expect.objectContaining({ timer_end_at: null, paused_seconds: expect.any(Number) })));
});

it("adopts another view's committed progress without echoing a stale write", async () => {
  const recipe = recipeFixture();
  recipe.steps = [0, 1, 2].map((index) => ({
    order: index + 1, instruction: `Step ${index + 1}`, duration_min: null,
    temperature_f: null, equipment: [], inline_amounts: [],
  }));
  const progress: CookProgress = { recipe_id: recipe.id, step: 0, layout: "step", timer_end_at: null, paused_seconds: null, session_id: "session-1", completed_at: null };
  const onSaveProgress = vi.fn(async (value: CookProgressPatch) => { void value; });
  const props = { recipe, pantry: [], onSaveProgress, onComplete: async () => true, onSetPantryStatus: async () => undefined };
  const view = render(<CookMode {...props} progress={progress} />);

  // Another tab advanced the same session: adopt it, never write it back.
  const fromOtherView: CookProgress = { ...progress, step: 1, timer_end_at: Date.now() + 60_000 };
  view.rerender(<CookMode {...props} progress={fromOtherView} />);
  expect(await screen.findByText("Step 2 of 3")).toBeInTheDocument();
  await waitFor(() => expect(onSaveProgress).not.toHaveBeenCalled());

  // A real local action still persists, and from the adopted state.
  fireEvent.click(screen.getAllByRole("button", { name: /Next/ })[0]);
  await waitFor(() => expect(onSaveProgress).toHaveBeenCalledTimes(1));
  expect(onSaveProgress.mock.lastCall?.[0]).toEqual({ recipe_id: recipe.id, session_id: progress.session_id, step: 2 });

  // The echo of our own write must not roll the view back either.
  view.rerender(<CookMode {...props} progress={{ ...fromOtherView, step: 2 }} />);
  expect(await screen.findByText("Step 3 of 3")).toBeInTheDocument();
  expect(onSaveProgress).toHaveBeenCalledTimes(1);
});
