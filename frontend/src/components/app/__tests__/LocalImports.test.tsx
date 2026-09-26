import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { recipeFixture } from "@/lib/__tests__/fixtures/recipe";
import { LocalImports } from "../LocalImports";
import { selectVerifiedAccount } from "@/lib/local/db";

const { listLocalImports, queueLocalImport, retryLocalImport, reselectScreenshotImport,
  updateImportDraft, acceptDraft } = vi.hoisted(() => ({
  listLocalImports: vi.fn(), queueLocalImport: vi.fn(), retryLocalImport: vi.fn(),
  reselectScreenshotImport: vi.fn(), updateImportDraft: vi.fn(), acceptDraft: vi.fn(),
}));
vi.mock("@/lib/local/imports", () => ({
  listLocalImports, queueLocalImport, retryLocalImport, reselectScreenshotImport, updateImportDraft, acceptDraft,
}));
beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  listLocalImports.mockResolvedValue([]);
  queueLocalImport.mockResolvedValue({ id: "queued" });
  updateImportDraft.mockResolvedValue(undefined);
  acceptDraft.mockResolvedValue({ ...recipeFixture(), id: "job-1" });
  selectVerifiedAccount("owner");
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-key";
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

it("queues pasted recipe text for the verified account and keeps manual entry", async () => {
  render(<LocalImports drafts={[]} />);
  fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "Toast the bread." } });
  fireEvent.click(screen.getByRole("button", { name: "Import pasted text" }));
  await waitFor(() => expect(queueLocalImport).toHaveBeenCalledWith({ kind: "text", payload_text: "Toast the bread." }, expect.objectContaining({ ownerId: "owner" })));
  expect(screen.getByRole("link", { name: /Enter a recipe manually/ })).toHaveAttribute("href", "/app#/cookbook/new");
});

it("shows warnings, persists review edits, and saves only on explicit Save", async () => {
  const draft = { id: "job-1", recipe: { ...recipeFixture(), id: "job-1" }, warnings: ["Check servings"], received_at: "2026-09-20T12:00:00Z" };
  render(<LocalImports drafts={[draft]} />);
  expect(await screen.findByText("Check servings")).toBeInTheDocument();
  expect(acceptDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "My toast" } });
  await waitFor(() => expect(updateImportDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "My toast" }), expect.objectContaining({ ownerId: "owner" })));
  fireEvent.change(screen.getByLabelText("Servings"), { target: { value: "4" } });
  await waitFor(() => expect(updateImportDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ servings: 4 }), expect.objectContaining({ ownerId: "owner" })));
  expect(acceptDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save to cookbook" }));
  await waitFor(() => expect(acceptDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "My toast" }), expect.objectContaining({ ownerId: "owner" })));
});

it("requires a new screenshot for an expired uploaded request", async () => {
  listLocalImports.mockResolvedValue([{ id: "old", kind: "screenshot", state: "error", error: "Import expired; submit again", upload: null, acknowledged: false, created_at: "2026-09-20T12:00:00Z" }]);
  render(<LocalImports drafts={[]} />);
  expect(await screen.findByText("Import expired; submit again")).toBeInTheDocument();
  expect(screen.getByLabelText("Reselect screenshot")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reselect screenshot"), { target: { files: [new File(["png"], "toast.png", { type: "image/png" })] } });
  await waitFor(() => expect(reselectScreenshotImport).toHaveBeenCalledWith("old", expect.any(File), expect.objectContaining({ ownerId: "owner" })));
});

it("ignores the legacy import-owner cache", async () => {
  window.localStorage.setItem("aaf-import-owner-id", "old-owner");
  render(<LocalImports drafts={[]} />);
  fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "Soup" } });
  fireEvent.click(screen.getByRole("button", { name: "Import pasted text" }));
  await waitFor(() => expect(queueLocalImport).toHaveBeenCalledWith(
    { kind: "text", payload_text: "Soup" }, expect.objectContaining({ ownerId: "owner" }),
  ));
});

it("uses the previously verified account while offline", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  render(<LocalImports drafts={[]} />);
  fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "Soup" } });
  fireEvent.click(screen.getByRole("button", { name: "Import pasted text" }));
  await waitFor(() => expect(queueLocalImport).toHaveBeenCalledWith(
    { kind: "text", payload_text: "Soup" }, expect.objectContaining({ ownerId: "owner" }),
  ));
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

it("uses a newly verified account for new requests", async () => {
  selectVerifiedAccount("new-owner");
  render(<LocalImports drafts={[]} />);
  fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "Soup" } });
  fireEvent.click(screen.getByRole("button", { name: "Import pasted text" }));
  await waitFor(() => expect(queueLocalImport).toHaveBeenCalledWith(
    { kind: "text", payload_text: "Soup" }, expect.objectContaining({ ownerId: "new-owner" }),
  ));
});

it("keeps pasted text and URL available after a local queue failure", async () => {
  queueLocalImport.mockRejectedValue(new Error("Local storage failed"));
  render(<LocalImports drafts={[]} />);
  fireEvent.change(screen.getByLabelText("Recipe text"), { target: { value: "Toast the bread." } });
  fireEvent.click(screen.getByRole("button", { name: "Import pasted text" }));
  await screen.findByText("Local storage failed");
  expect(screen.getByLabelText("Recipe text")).toHaveValue("Toast the bread.");
  fireEvent.click(screen.getByRole("button", { name: "🔗 URL" }));
  fireEvent.change(screen.getByPlaceholderText("Paste a recipe URL, TikTok, or Instagram Reel"), { target: { value: "https://example.com/soup" } });
  fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
  await waitFor(() => expect(queueLocalImport).toHaveBeenCalledWith(expect.objectContaining({ source_url: "https://example.com/soup" }), expect.objectContaining({ ownerId: "owner" })));
  expect(screen.getByPlaceholderText("Paste a recipe URL, TikTok, or Instagram Reel")).toHaveValue("https://example.com/soup");
});

it("waits for the review edit commit before explicit Save", async () => {
  let finish!: () => void;
  updateImportDraft.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const draft = { id: "job-1", recipe: { ...recipeFixture(), id: "job-1" }, warnings: [], received_at: "2026-09-20T12:00:00Z" };
  render(<LocalImports drafts={[draft]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "My toast" } });
  expect(screen.getByText("Saving draft…")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save to cookbook" }));
  expect(acceptDraft).not.toHaveBeenCalled();
  await waitFor(() => expect(updateImportDraft).toHaveBeenCalledTimes(1));
  await act(async () => { finish(); });
  await waitFor(() => expect(acceptDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "My toast" }), expect.objectContaining({ ownerId: "owner" })));
});

it("reports a failed draft write and retries it", async () => {
  updateImportDraft.mockRejectedValueOnce(new Error("Quota exceeded"));
  const draft = { id: "job-1", recipe: { ...recipeFixture(), id: "job-1" }, warnings: [], received_at: "2026-09-20T12:00:00Z" };
  render(<LocalImports drafts={[draft]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "My toast" } });
  expect(await screen.findByText("Quota exceeded")).toBeInTheDocument();
  expect(acceptDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry saving draft" }));
  await screen.findByText("All changes saved locally");
  expect(updateImportDraft).toHaveBeenCalledTimes(2);
});

it("freezes review fields while explicit Save is pending", async () => {
  let finish!: () => void;
  acceptDraft.mockImplementationOnce(() => new Promise((resolve) => {
    finish = () => resolve({ ...recipeFixture(), id: "job-1", title: "First title" });
  }));
  const draft = { id: "job-1", recipe: { ...recipeFixture(), id: "job-1" }, warnings: [], received_at: "2026-09-20T12:00:00Z" };
  render(<LocalImports drafts={[draft]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "First title" } });
  await screen.findByText("All changes saved locally");
  fireEvent.click(screen.getByRole("button", { name: "Save to cookbook" }));
  await waitFor(() => expect(acceptDraft).toHaveBeenCalledWith("job-1", expect.objectContaining({ title: "First title" }), expect.objectContaining({ ownerId: "owner" })));
  expect(screen.getByLabelText("Recipe title")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "Later title" } });
  expect(screen.getByLabelText("Recipe title")).toHaveValue("First title");
  expect(updateImportDraft).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
});

it("warns on unload immediately after a review edit starts saving", async () => {
  updateImportDraft.mockImplementationOnce(() => new Promise<void>(() => undefined));
  const draft = { id: "job-1", recipe: { ...recipeFixture(), id: "job-1" }, warnings: [], received_at: "2026-09-20T12:00:00Z" };
  render(<LocalImports drafts={[draft]} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Recipe title"), { target: { value: "Pending title" } });
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
});
