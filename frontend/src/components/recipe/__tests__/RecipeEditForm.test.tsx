import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { RecipeEditForm } from "../RecipeEditForm";
import type { Recipe } from "@/lib/recipe-schema";

const recipe = recipeFixture();

beforeEach(() => vi.clearAllMocks());

it("saves common edits with the original baseline and retains untouched fields", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<RecipeEditForm recipe={recipe} onSave={onSave} />);

  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "  New title  " },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Updated description" },
  });
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "bread flour" },
  });
  fireEvent.change(screen.getByLabelText("Instruction"), {
    target: { value: "Stir well" },
  });
  fireEvent.change(screen.getByLabelText("Notes"), {
    target: { value: "Serve warm" },
  });
  fireEvent.change(screen.getByLabelText("Storage instructions"), {
    target: { value: "Refrigerate" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const [saved, baseline] = onSave.mock.calls[0] as [Recipe, Recipe];
  expect(saved).toMatchObject({
    title: "New title",
    description: "Updated description",
    ingredients: [expect.objectContaining({ name: "bread flour" })],
    steps: [expect.objectContaining({ instruction: "Stir well" })],
    notes: "Serve warm",
    storage_instructions: "Refrigerate",
    source_url: recipe.source_url,
    cuisine: recipe.cuisine,
    times_made: recipe.times_made,
  });
  expect(baseline).toBe(recipe);
});

it("uses a null baseline for a new recipe", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<RecipeEditForm recipe={recipe} isNew onSave={onSave} />);

  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.any(Object), null));
  expect(screen.getAllByRole("link", { name: "Cancel" })[0]).toHaveAttribute(
    "href",
    expect.stringContaining("cookbook")
  );
});

it("rejects blank titles and focuses the title field", async () => {
  const onSave = vi.fn();
  render(<RecipeEditForm recipe={recipe} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "   " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("title");
  expect(screen.getByLabelText("Title")).toHaveFocus();
  expect(onSave).not.toHaveBeenCalled();
});

it("keeps edits after a failed save and allows retry", async () => {
  const onSave = vi.fn()
    .mockRejectedValueOnce(new Error("Save failed"))
    .mockResolvedValueOnce(undefined);
  render(<RecipeEditForm recipe={recipe} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Updated" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByLabelText("Title")).toHaveValue("Updated");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
});

it("disables editing and duplicate submits while saving", async () => {
  let resolveSave!: () => void;
  const onSave = vi.fn(
    () => new Promise<void>((resolve) => { resolveSave = resolve; })
  );
  render(<RecipeEditForm recipe={recipe} onSave={onSave} />);
  const form = screen.getByRole("button", { name: "Save changes" }).closest("form")!;

  fireEvent.submit(form);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(form.querySelector("fieldset")).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Saving…" })).toHaveLength(2);
  fireEvent.submit(form);
  expect(onSave).toHaveBeenCalledTimes(1);
  resolveSave();
});

it("accepts fractional step duration and clears stale parsed amounts", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<RecipeEditForm recipe={recipe} onSave={onSave} />);

  const duration = screen.getByLabelText("Duration (min)") as HTMLInputElement;
  fireEvent.change(duration, { target: { value: "1.5" } });
  expect(duration).toHaveAttribute("step", "any");
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: "3 handfuls" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const [saved] = onSave.mock.calls[0] as [Recipe, Recipe | null];
  expect(saved.steps[0].duration_min).toBe(1.5);
  expect(saved.ingredients[0].quantity).toEqual({
    value: null,
    unit: null,
    as_written: "3 handfuls",
  });
});
