import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { LocalScreens } from "../LocalScreens";
import { captureLocalAccount, selectLegacyGuest, selectVerifiedAccount, signOutLocalAccount } from "@/lib/local/db";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import type { LibrarySnapshot } from "@/lib/local/schema";
import type { PlanView } from "@/components/plan/PlanView";
import type { RecipeDetail } from "@/components/recipe/RecipeDetail";
import type { RecipeEditForm } from "@/components/recipe/RecipeEditForm";
const mocks = vi.hoisted(() => ({ props: {} as Record<string, unknown>, realPlan: false, operations: Object.fromEntries(["addPantryItem", "addPlannedMeal", "addRecipesToShopping", "addShoppingItem", "beginCookSession", "completeCookSession", "completeShopping", "generateWeekShopping", "putRecipe", "removePantryItem", "removePlannedMeal", "removeShoppingItem", "saveCookProgress", "setPantryStatus", "setPlannedServings", "setShoppingChecked"].map((name) => [name, vi.fn()])) }));
vi.mock("@/lib/local/repository", () => mocks.operations);
vi.mock("@/components/plan/PlanView", async (original) => {
  const { PlanView: ActualPlan } = await original<typeof import("@/components/plan/PlanView")>();
  return { PlanView: (props: ComponentProps<typeof PlanView>) => { mocks.props = { ...props }; return mocks.realPlan ? <ActualPlan {...props} /> : null; } };
});
vi.mock("@/components/recipe/RecipeDetail", () => ({ RecipeDetail: (props: Record<string, unknown>) => { mocks.props = props; return null; } }));
vi.mock("@/components/recipe/RecipeEditForm", () => ({ RecipeEditForm: (props: Record<string, unknown>) => { mocks.props = props; return null; } }));
vi.mock("@/components/shopping/ShoppingListView", () => ({ ShoppingListView: (props: Record<string, unknown>) => { mocks.props = props; return null; } }));
vi.mock("@/components/pantry/PantryView", () => ({ PantryView: (props: Record<string, unknown>) => { mocks.props = props; return null; } }));
vi.mock("@/components/cook/CookMode", () => ({ CookMode: (props: Record<string, unknown>) => { mocks.props = props; return null; } }));
const recipe = recipeFixture();
const snapshot: LibrarySnapshot = { recipes: [recipe], meal_plans: [], shopping: [], pantry: [], cook_progress: [], drafts: [], settings: [] };
beforeEach(() => { vi.resetAllMocks(); mocks.realPlan = false; selectVerifiedAccount("a"); window.location.hash = "#/settings"; Object.values(mocks.operations).forEach((operation) => operation.mockResolvedValue(undefined)); });
afterEach(() => { cleanup(); signOutLocalAccount(); });
function switchAccount() { signOutLocalAccount(); selectVerifiedAccount("b"); }
it.each(["onAdd", "onRemove", "onServingsChange", "onGenerate"] as const)("binds deferred planner %s before invocation", async (name) => {
  render(<LocalScreens route={{ view: "plan" }} snapshot={snapshot} />);
  const callback = (mocks.props as unknown as ComponentProps<typeof PlanView>)[name] as (...args: unknown[]) => Promise<void>;
  switchAccount(); await expect(callback("2026-09-21", 0, recipe.id)).rejects.toThrow("Local account changed");
  expect(Object.values(mocks.operations).some((operation) => operation.mock.calls.length)).toBe(false);
});
it.each(["shop", "pantry"] as const)("binds every %s mutation callback", async (view) => {
  render(<LocalScreens route={{ view }} snapshot={snapshot} />); const callbacks = Object.values(mocks.props).filter((value) => typeof value === "function") as Array<(...args: unknown[]) => Promise<unknown>>;
  switchAccount(); for (const callback of callbacks) await expect(callback()).rejects.toThrow("Local account changed");
  expect(Object.values(mocks.operations).some((operation) => operation.mock.calls.length)).toBe(false);
});
it("does not complete a stale Mark cooked continuation", async () => {
  let finish!: (value: { session_id: string }) => void;
  mocks.operations.beginCookSession.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  render(<LocalScreens route={{ view: "recipe", recipeId: recipe.id }} snapshot={snapshot} />);
  const pending = (mocks.props as unknown as ComponentProps<typeof RecipeDetail>).onMarkCooked!();
  switchAccount(); finish({ session_id: "same-session" }); await expect(pending).rejects.toThrow("Local account changed");
  expect(mocks.operations.completeCookSession).not.toHaveBeenCalled();
});
it.each(["save", "start", "generate"] as const)("discards late %s completion before navigation", async (kind) => {
  let finish!: () => void;
  mocks.operations[kind === "save" ? "putRecipe" : kind === "start" ? "beginCookSession" : "generateWeekShopping"].mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  render(<LocalScreens route={kind === "save" ? { view: "edit", recipeId: recipe.id } : kind === "start" ? { view: "recipe", recipeId: recipe.id } : { view: "plan" }} snapshot={snapshot} />);
  const pending = kind === "save" ? (mocks.props as unknown as ComponentProps<typeof RecipeEditForm>).onSave!(recipe) : kind === "start" ? (mocks.props as unknown as ComponentProps<typeof RecipeDetail>).onStartCook!() : (mocks.props as unknown as ComponentProps<typeof PlanView>).onGenerate("2026-09-21");
  switchAccount(); finish(); await expect(pending).rejects.toThrow("Local account changed"); expect(window.location.hash).toBe("#/settings");
});
it.each(["guest", "account"])("preserves %s callbacks", async (kind) => {
  if (kind === "guest") selectLegacyGuest(); const account = captureLocalAccount();
  render(<LocalScreens route={{ view: "plan" }} snapshot={snapshot} />);
  await act(async () => { await (mocks.props as unknown as ComponentProps<typeof PlanView>).onGenerate("2026-09-21"); });
  expect(mocks.operations.generateWeekShopping).toHaveBeenCalledTimes(1); expect(captureLocalAccount()).toBe(account);
});

it.each(["add", "remove", "servings"] as const)("stops queued planner %s and Review shopping after switching", async (kind) => {
  mocks.realPlan = true; let finish!: () => void;
  mocks.operations.removePlannedMeal.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  const planned = { ...snapshot, meal_plans: [{ week_of: "2026-09-21", updated_at: "2026-09-21T00:00:00Z", meals: [{ id: "first", recipe_id: recipe.id, day_index: 0, servings: null }, { id: "second", recipe_id: recipe.id, day_index: 0, servings: null }] }] };
  render(<LocalScreens route={{ view: "plan", weekOf: "2026-09-21" }} snapshot={planned} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Remove Toast" })[0]);
  await waitFor(() => expect(mocks.operations.removePlannedMeal).toHaveBeenCalledTimes(1));
  if (kind === "remove") fireEvent.click(screen.getAllByRole("button", { name: "Remove Toast" })[1]);
  if (kind === "servings") fireEvent.change(screen.getAllByRole("spinbutton", { name: "Toast servings" })[1], { target: { value: "3" } });
  if (kind === "add") { fireEvent.click(screen.getAllByRole("button", { name: /Add recipe/ })[0]); fireEvent.click(screen.getByRole("button", { name: "Toast" })); }
  fireEvent.click(screen.getByRole("button", { name: /Review shopping/ }));
  switchAccount(); await act(async () => { finish(); });
  expect(mocks.operations.removePlannedMeal).toHaveBeenCalledTimes(1);
  expect(mocks.operations.addPlannedMeal).not.toHaveBeenCalled(); expect(mocks.operations.setPlannedServings).not.toHaveBeenCalled();
  expect(mocks.operations.generateWeekShopping).not.toHaveBeenCalled(); expect(window.location.hash).toBe("#/settings");
});
it("binds cook progress, completion, and pantry callbacks", async () => {
  const cooking = { ...snapshot, cook_progress: [{ recipe_id: recipe.id, session_id: "session", step: 0, layout: "step" as const, timer_end_at: null, paused_seconds: null, completed_at: null, updated_at: "2026-09-21T00:00:00Z" }] };
  render(<LocalScreens route={{ view: "cook", recipeId: recipe.id }} snapshot={cooking} />);
  const callbacks = Object.values(mocks.props).filter((value) => typeof value === "function") as Array<(...args: unknown[]) => Promise<unknown>>;
  switchAccount(); for (const callback of callbacks) await expect(callback()).rejects.toThrow("Local account changed");
  expect(Object.values(mocks.operations).some((operation) => operation.mock.calls.length)).toBe(false);
});
