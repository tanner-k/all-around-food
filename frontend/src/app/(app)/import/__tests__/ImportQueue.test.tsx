import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParseJob } from "@/lib/db/parseJobs";

// Mock the data layer so the component renders without a live Supabase client.
const listJobs = vi.fn();
const retryJob = vi.fn();
const subscribeJobs = vi.fn((cb: () => void): (() => void) => {
  void cb;
  return () => {};
});
const pollJobs = vi.fn((cb: () => void): (() => void) => {
  void cb;
  return () => {};
});

vi.mock("@/lib/db/parseJobs", () => ({
  listJobs: () => listJobs(),
  retryJob: (id: string) => retryJob(id),
  subscribeJobs: (cb: () => void) => subscribeJobs(cb),
  pollJobs: (cb: () => void) => pollJobs(cb),
}));

// Import after the mock is registered.
import { ImportQueue } from "../ImportQueue";

function job(overrides: Partial<ParseJob>): ParseJob {
  return {
    id: "job-1",
    kind: "url",
    source_url: null,
    storage_path: null,
    payload_text: null,
    status: "pending",
    attempts: 0,
    error: null,
    result_recipe_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("ImportQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state when there are no jobs", async () => {
    listJobs.mockResolvedValue([]);
    render(<ImportQueue />);
    expect(await screen.findByText(/Nothing queued yet/i)).toBeInTheDocument();
  });

  it("renders each status, the source, and a View recipe link when done", async () => {
    listJobs.mockResolvedValue([
      job({
        id: "done-1",
        kind: "url",
        source_url: "https://example.com/recipe",
        status: "done",
        result_recipe_id: "recipe-42",
      }),
      job({
        id: "err-1",
        kind: "screenshot",
        storage_path: "user-1/abc.png",
        status: "error",
        error: "parser blew up",
      }),
      job({ id: "pending-1", kind: "video", status: "pending" }),
    ]);

    render(<ImportQueue />);

    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    // Source rendering: URL and file name.
    expect(
      screen.getByText("https://example.com/recipe")
    ).toBeInTheDocument();
    expect(screen.getByText("abc.png")).toBeInTheDocument();

    // Error text is shown.
    expect(screen.getByText("parser blew up")).toBeInTheDocument();

    // View recipe link points at the recipe.
    const link = screen.getByRole("link", { name: /View recipe/i });
    expect(link).toHaveAttribute("href", "/cookbook/recipe-42");
  });

  it("retries a failed job", async () => {
    listJobs.mockResolvedValue([
      job({ id: "err-1", status: "error", error: "boom" }),
    ]);
    retryJob.mockResolvedValue(job({ id: "err-1", status: "pending" }));

    render(<ImportQueue />);

    const retryButton = await screen.findByRole("button", { name: /Retry/i });
    await userEvent.click(retryButton);

    await waitFor(() => expect(retryJob).toHaveBeenCalledWith("err-1"));
  });
});
