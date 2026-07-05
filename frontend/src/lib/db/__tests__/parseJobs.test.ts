import { describe, expect, it } from "vitest";
import { classifyUrlKind } from "../parseJobs";

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
