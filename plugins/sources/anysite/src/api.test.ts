import { describe, test, expect } from "bun:test";
import { toKolPost, totalReactions, extractUrn } from "./api";

describe("anysite mapping", () => {
  test("tst_anysite_001 empty repost → text from nested repost (live i20h shape)", () => {
    const p = toKolPost({
      urn: { type: "activity", value: "739" },
      is_empty_repost: true,
      text: "",
      created_at: 1763161566,
      repost: { text: "original reshared content", url: "https://linkedin.com/feed/update/x" },
    });
    expect(p.text).toBe("original reshared content");
    expect(p.isRepost).toBe(true);
    expect(p.url).toBe("https://linkedin.com/feed/update/x"); // falls back to repost url
  });

  test("tst_anysite_002 original post keeps its own text", () => {
    const p = toKolPost({ urn: { value: "1" }, text: "my post", share_url: "u", reactions: [{ count: 3 }] });
    expect(p.text).toBe("my post");
    expect(p.isRepost).toBe(false);
    expect(p.reactions).toBe(3);
  });

  test("tst_anysite_003 helpers: urn + summed reactions", () => {
    expect(extractUrn({ type: "activity", value: "9" })).toBe("9");
    expect(totalReactions([{ count: 7 }, { count: 3 }])).toBe(10);
    expect(totalReactions(5)).toBe(5);
  });
});
