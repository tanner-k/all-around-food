import { beforeEach, describe, expect, it, vi } from "vitest";
import { ackJob, classifyUrlKind, enqueueImageJob, enqueueTextJob, enqueueUrlJob, getJob, retryJob } from "../parseJobs";

const { createClient, insert, select, single, rpc, upload, getUser } = vi.hoisted(() => ({
  createClient: vi.fn(), insert: vi.fn(), select: vi.fn(), single: vi.fn(), rpc: vi.fn(),
  upload: vi.fn(), getUser: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient }));
const job = { id: "00000000-0000-4000-8000-000000000001", status: "pending" };
beforeEach(() => {
  vi.clearAllMocks();
  single.mockResolvedValue({ data: job, error: null });
  select.mockReturnValue({ single, eq: vi.fn().mockReturnValue({ single }) });
  insert.mockReturnValue({ select });
  rpc.mockResolvedValue({ data: job, error: null });
  upload.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
  createClient.mockReturnValue({ from: () => ({ insert, select }), rpc, auth: { getUser },
    storage: { from: () => ({ upload }) } });
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

it("pins URL and text inserts to their expected owner", async () => {
  await enqueueUrlJob("https://example.com/toast", job.id, "owner-a");
  await enqueueTextJob("Toast", "text", job.id, "owner-a");
  expect(insert).toHaveBeenNthCalledWith(1, { id: job.id, kind: "url", source_url: "https://example.com/toast", user_id: "owner-a" });
  expect(insert).toHaveBeenNthCalledWith(2, { id: job.id, kind: "text", payload_text: "Toast", user_id: "owner-a" });
});

it("stops an expected-owner submission before network work when account switched", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "owner-b" } }, error: null });
  await expect(enqueueUrlJob("https://example.com/toast", job.id, "owner-a")).rejects.toThrow("Import account changed");
  await expect(enqueueTextJob("Toast", "text", job.id, "owner-a")).rejects.toThrow("Import account changed");
  await expect(enqueueImageJob(new File(["png"], "test.png", { type: "image/png" }), "screenshot", job.id, "owner-a"))
    .rejects.toThrow("Import account changed");
  expect(insert).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

it("pins screenshot path and inserted owner even if the account changes during upload", async () => {
  upload.mockImplementation(async () => {
    getUser.mockResolvedValue({ data: { user: { id: "owner-b" } }, error: null });
    return { error: null };
  });
  await enqueueImageJob(new File(["png"], "test.png", { type: "image/png" }), "screenshot", job.id, "owner-a");
  expect(upload).toHaveBeenCalledWith(`owner-a/${job.id}.png`, expect.any(File), expect.objectContaining({ upsert: false }));
  expect(insert).toHaveBeenCalledWith({ id: job.id, kind: "screenshot", storage_path: `owner-a/${job.id}.png`, user_id: "owner-a" });
});

it("reuses the stable image path after an ambiguous insert without overwriting the object", async () => {
  single.mockResolvedValueOnce({ data: null, error: { message: "network interrupted" } });
  const file = new File(["png"], "test.png", { type: "image/png" });
  await expect(enqueueImageJob(file, "screenshot", job.id, "owner-a")).rejects.toThrow("network interrupted");
  upload.mockResolvedValueOnce({ error: { message: "already exists" } });
  expect(await enqueueImageJob(file, "screenshot", job.id, "owner-a")).toEqual(job);
  expect(upload).toHaveBeenNthCalledWith(2, `owner-a/${job.id}.png`, file,
    expect.objectContaining({ upsert: false }));
  expect(insert).toHaveBeenCalledTimes(2);
});
