import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeLocalDB } from "@/lib/local/db";
import { addPlannedMeal, putRecipe, readSnapshot } from "@/lib/local/repository";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { LocalApp } from "../LocalApp";

async function reset() {
  await closeLocalDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("aaf-local");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => { await reset(); window.location.hash = "#/plan"; });
afterEach(reset);

it("plans repeated recipes, generates shopping, and stocks checked items offline", async () => {
  await putRecipe(recipeFixture());
  render(<LocalApp />);
  await screen.findByText(/Plan your week/);
  fireEvent.click(screen.getAllByRole("button", { name: /Add recipe/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Toast" }));
  await screen.findByText("Toast");
  fireEvent.click(screen.getAllByRole("button", { name: /Add recipe/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Toast" }));
  await waitFor(() => expect(screen.getAllByText("Toast")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: /Review shopping/ }));
  await waitFor(() => expect(window.location.hash).toBe("#/shop"));
  await screen.findByText("bread");
  expect(screen.getByText("4 slices")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "bread" }));
  await screen.findByRole("button", { name: "Mark as bought" });
  fireEvent.click(screen.getByRole("button", { name: "Mark as bought" }));
  await waitFor(async () => expect((await readSnapshot()).shopping).toHaveLength(0));
  act(() => { window.location.hash = "#/pantry"; window.dispatchEvent(new Event("hashchange")); });
  expect(await screen.findByText("bread")).toBeInTheDocument();
});

it("targets the second card when the first card is removed before the view refreshes", async () => {
  window.location.hash = "#/plan?weekOf=2026-09-21";
  await putRecipe(recipeFixture());
  await addPlannedMeal("2026-09-21", 0, "recipe-1");
  await addPlannedMeal("2026-09-21", 0, "recipe-1");
  await addPlannedMeal("2026-09-21", 0, "recipe-1");
  const [first, second, third] = (await readSnapshot()).meal_plans[0].meals;
  render(<LocalApp />);
  await screen.findAllByRole("button", { name: "Remove Toast" });
  const removeButtons = screen.getAllByRole("button", { name: "Remove Toast" });
  fireEvent.click(removeButtons[0]);
  fireEvent.click(removeButtons[1]);
  await waitFor(async () => expect((await readSnapshot()).meal_plans[0].meals.map((meal) => meal.id)).toEqual([third.id]));
  expect(first.id).not.toBe(second.id);
});

it("edits the second card after a rapid removal without changing the third", async () => {
  window.location.hash = "#/plan?weekOf=2026-09-21";
  await putRecipe(recipeFixture());
  for (let index = 0; index < 3; index++) await addPlannedMeal("2026-09-21", 0, "recipe-1");
  const [, second, third] = (await readSnapshot()).meal_plans[0].meals;
  render(<LocalApp />);
  await screen.findAllByRole("button", { name: "Remove Toast" });
  const removeButtons = screen.getAllByRole("button", { name: "Remove Toast" });
  const servingInputs = screen.getAllByRole("spinbutton", { name: "Toast servings" });
  fireEvent.click(removeButtons[0]);
  fireEvent.change(servingInputs[1], { target: { value: "3" } });
  await waitFor(async () => expect((await readSnapshot()).meal_plans[0].meals.map((meal) => [meal.id, meal.servings])).toEqual([[second.id, 3], [third.id, null]]));
});

it("does not generate or navigate after a serving edit fails", async () => {
  window.location.hash = "#/plan?weekOf=2026-09-21";
  await putRecipe(recipeFixture());
  await addPlannedMeal("2026-09-21", 0, "recipe-1");
  render(<LocalApp />);
  const servings = await screen.findByRole("spinbutton", { name: "Toast servings" });
  fireEvent.change(servings, { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: /Review shopping/ }));
  await waitFor(() => expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("Number must be greater than 0"))).toBe(true));
  expect(window.location.hash).toBe("#/plan?weekOf=2026-09-21");
  expect((await readSnapshot()).shopping).toHaveLength(0);
});

it("keeps review blocked when an earlier queued edit fails but a later edit succeeds", async () => {
  window.location.hash = "#/plan?weekOf=2026-09-21";
  await putRecipe(recipeFixture());
  await addPlannedMeal("2026-09-21", 0, "recipe-1");
  await addPlannedMeal("2026-09-21", 0, "recipe-1");
  render(<LocalApp />);
  const inputs = await screen.findAllByRole("spinbutton", { name: "Toast servings" });
  fireEvent.change(inputs[0], { target: { value: "0" } });
  fireEvent.change(inputs[1], { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: /Review shopping/ }));
  await waitFor(async () => expect((await readSnapshot()).meal_plans[0].meals[1].servings).toBe(2));
  expect(window.location.hash).toBe("#/plan?weekOf=2026-09-21");
  expect((await readSnapshot()).shopping).toHaveLength(0);
});
