import { beforeEach, describe, expect, it, vi } from "vitest";
import { ackJob, classifyUrlKind, enqueueImageJob, enqueueTextJob, enqueueUrlJob, getJob, retryJob } from "../parseJobs";

const { createClient, insert, select, single, rpc } = vi.hoisted(() => ({
  createClient: vi.fn(), insert: vi.fn(), select: vi.fn(), single: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient }));
const job = { id: "00000000-0000-4000-8000-000000000001", status: "pending" };
beforeEach(() => {
  vi.clearAllMocks();
  single.mockResolvedValue({ data: job, error: null });
  select.mockReturnValue({ single, eq: vi.fn().mockReturnValue({ single }) });
  insert.mockReturnValue({ select });
  rpc.mockResolvedValue({ data: job, error: null });
  createClient.mockReturnValue({ from: () => ({ insert, select }), rpc });
});

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

it("submits a stable UUID without client-owned state columns", async () => {
  await enqueueUrlJob("https://example.com/recipe", job.id);
  expect(insert).toHaveBeenCalledWith({ id: job.id, kind: "url", source_url: "https://example.com/recipe" });
});

it("reads its existing row after a duplicate submission", async () => {
  single.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } });
  expect(await enqueueTextJob("eggs", "text", job.id)).toEqual(job);
  expect(insert).toHaveBeenCalledWith({ id: job.id, kind: "text", payload_text: "eggs" });
});

it("reports a missing owned row as expired", async () => {
  single.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "none" } });
  await expect(getJob(job.id)).rejects.toThrow("Import expired; submit again");
});

it("uses owner-checked RPCs for retry and acknowledgement", async () => {
  await retryJob(job.id);
  await ackJob(job.id);
  expect(rpc).toHaveBeenNthCalledWith(1, "retry_import_job", { p_id: job.id });
  expect(rpc).toHaveBeenNthCalledWith(2, "ack_import_job", { p_id: job.id });
});

it("rejects non-image uploads before contacting Storage", async () => {
  const file = new File(["GIF89a"], "image.gif", { type: "image/gif" });
  await expect(enqueueImageJob(file, "screenshot", job.id)).rejects.toThrow("JPEG, PNG, or WebP");
  expect(createClient).not.toHaveBeenCalled();
});
