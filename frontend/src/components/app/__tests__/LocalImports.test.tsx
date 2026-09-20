import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { LocalImports } from "../LocalImports";

const { listLocalImports, queueLocalImport, retryLocalImport, reselectScreenshotImport,
  updateImportDraft, acceptDraft, createClient } = vi.hoisted(() => ({
  listLocalImports: vi.fn(), queueLocalImport: vi.fn(), retryLocalImport: vi.fn(),
  reselectScreenshotImport: vi.fn(), updateImportDraft: vi.fn(), acceptDraft: vi.fn(), createClient: vi.fn(),
}));
vi.mock("@/lib/local/imports", () => ({
  listLocalImports, queueLocalImport, retryLocalImport, reselectScreenshotImport, updateImportDraft, acceptDraft,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient }));

beforeEach(() => {
  vi.resetAllMocks();
  listLocalImports.mockResolvedValue([]);
  queueLocalImport.mockResolvedValue({ id: "queued" });
  updateImportDraft.mockResolvedValue(undefined);
  acceptDraft.mockResolvedValue({ ...recipeFixture(), id: "job-1" });
  createClient.mockReturnValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "owner" } } } }) } });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-key";
});

it("queues pasted recipe text with the cached owner and keeps manual entry", async () => {
  render(<LocalImports drafts={[]} />);
  fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "Toast the bread." } });
  fireEvent.click(screen.getByRole("button", { name: "Import pasted text" }));
  await waitFor(() => expect(queueLocalImport).toHaveBeenCalledWith({ kind: "text", payload_text: "Toast the bread.", owner_id: "owner" }));
  expect(screen.getByRole("link", { name: /Enter a recipe manually/ })).toHaveAttribute("href", "/app#/cookbook/new");
});

it("shows warnings, persists review edits, and saves only on explicit Save", async () => {
  const draft = { id: "job-1", recipe: { ...recipeFixture(), id: "job-1" }, warnings: ["Check servings"], received_at: "2026-09-20T12:00:00Z" };
  render(<LocalImports drafts={[draft]} />);
  expect(await screen.findByText("Check servings")).toBeInTheDocument();
  expect(acceptDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "My toast" } });
  await waitFor(() => expect(updateImportDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "My toast" })));
  fireEvent.change(screen.getByLabelText("Servings"), { target: { value: "4" } });
  await waitFor(() => expect(updateImportDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ servings: 4 })));
  expect(acceptDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save to cookbook" }));
  await waitFor(() => expect(acceptDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "My toast" })));
});

it("requires a new screenshot for an expired uploaded request", async () => {
  listLocalImports.mockResolvedValue([{ id: "old", kind: "screenshot", state: "error", error: "Import expired; submit again", upload: null, acknowledged: false, created_at: "2026-09-20T12:00:00Z" }]);
  render(<LocalImports drafts={[]} />);
  expect(await screen.findByText("Import expired; submit again")).toBeInTheDocument();
  expect(screen.getByLabelText("Reselect screenshot")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reselect screenshot"), { target: { files: [new File(["png"], "toast.png", { type: "image/png" })] } });
  await waitFor(() => expect(reselectScreenshotImport).toHaveBeenCalledWith("old", expect.any(File)));
});
