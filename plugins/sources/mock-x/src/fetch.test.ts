import { describe, test, expect } from "bun:test";
import { fetchMockX } from "./fetch";

describe("mock-x fetch", () => {
  test("tst_mockx_001 tracked handle → profile + posts covering the S4 formats", async () => {
    const { envelopes } = await fetchMockX({ surface: "x", cursor: 0, tracked_handles: ["jack"] });
    const kinds = envelopes.map((e) => e.payload.entity_type);
    expect(kinds).toEqual(["profile", "post", "post", "post", "post", "post"]);
    expect(envelopes[0]!.payload.platform).toBe("x");
    expect(envelopes[1]!.payload.author_handle).toBe("jack");
    // One fixture per rich format (social-post-rendering S4).
    const types = envelopes.slice(1).map((e) => e.payload.post_type);
    expect(types).toEqual(["post", "long_form", "article", "reply", "post"]);
    const article = envelopes.find((e) => e.payload.post_type === "article")!.payload;
    expect(article.article_title).toBe("Why local-first wins");
    const withMedia = envelopes.find((e) => Array.isArray(e.payload.media))!.payload;
    expect((withMedia.media as Array<{ url: string }>)[0]!.url).toContain("https://");
  });

  test("tst_mockx_002 untracked handle → no envelopes (INV-1)", async () => {
    const { envelopes } = await fetchMockX({ surface: "x", cursor: 0, tracked_handles: ["ghost"] });
    expect(envelopes).toHaveLength(0);
  });

  test("tst_mockx_003 pages drain after page 0", async () => {
    const { envelopes, hasMore } = await fetchMockX({ surface: "x", cursor: 1, tracked_handles: ["jack"] });
    expect(envelopes).toHaveLength(0);
    expect(hasMore).toBe(false);
  });
});
