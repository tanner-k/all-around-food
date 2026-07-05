import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { from, update, eq, select, single };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: supabaseMock.from }),
}));

import { classifyUrlKind, retryJob } from "../parseJobs";

// URL → kind classification (video vs url). Mirrors the inline route's
// VIDEO_URL_HOST_RE host regex.

describe("classifyUrlKind", () => {
  it("classifies tiktok.com as video", () => {
    expect(classifyUrlKind("https://www.tiktok.com/@chef/video/123")).toBe(
      "video"
    );
  });

  it("classifies vm.tiktok.com short links as video", () => {
    expect(classifyUrlKind("https://vm.tiktok.com/ABC123/")).toBe("video");
  });

  it("classifies instagram.com reels as video", () => {
    expect(classifyUrlKind("https://www.instagram.com/reel/xyz/")).toBe(
      "video"
    );
  });

  it("classifies instagr.am short links as video", () => {
    expect(classifyUrlKind("https://instagr.am/p/xyz")).toBe("video");
  });

  it("classifies a normal recipe site as url", () => {
    expect(classifyUrlKind("https://www.seriouseats.com/some-recipe")).toBe(
      "url"
    );
  });

  it("does not treat lookalike hosts as video", () => {
    // A host that merely contains 'tiktok' as a substring but is a different
    // domain must not match the anchored host regex.
    expect(classifyUrlKind("https://nottiktok.com/recipe")).toBe("url");
    expect(classifyUrlKind("https://tiktok.com.evil.example/x")).toBe("url");
  });

  it("falls back to url for unparseable input", () => {
    expect(classifyUrlKind("not a url")).toBe("url");
  });
});

describe("retryJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets attempts when retrying", async () => {
    const retriedJob = {
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
    };
    supabaseMock.single.mockResolvedValue({ data: retriedJob, error: null });

    await expect(retryJob("job-1")).resolves.toEqual(retriedJob);

    expect(supabaseMock.from).toHaveBeenCalledWith("parse_jobs");
    expect(supabaseMock.update).toHaveBeenCalledWith({
      status: "pending",
      error: null,
      attempts: 0,
    });
    expect(supabaseMock.eq).toHaveBeenCalledWith("id", "job-1");
  });
});
