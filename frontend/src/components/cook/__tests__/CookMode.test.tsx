import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import type { CookProgress } from "@/lib/local/schema";
import { CookMode } from "../CookMode";

it("persists step, layout, timer deadline, and paused seconds", async () => {
  const recipe = recipeFixture();
  recipe.steps[0].duration_min = 1;
  const progress: CookProgress = { recipe_id: recipe.id, step: 0, layout: "step", timer_end_at: null, paused_seconds: null, session_id: "session-1", completed_at: null };
  const onSaveProgress = vi.fn(async (value: CookProgress) => { void value; });
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
