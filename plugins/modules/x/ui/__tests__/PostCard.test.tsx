// tst_fe_x_postcard_001 (social-post-rendering S5) — the feed card renders the
// ContentOS model: type Tag, relative date (+ absolute tooltip, "—" for null —
// INV-4), full text, media grid, formatted metrics, article title.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PostCard, formatNumber, groupThreads, relativeTime } from "../PostCard";

const AUTHOR = { name: "Jack", handle: "jack", avatar_url: "https://pbs.x.com/a.jpg" };

describe("PostCard (rich x post, X-native layout)", () => {
  it("article: author header + Tag + title + linkified body URL", () => {
    const { getByText, getByAltText } = render(
      <PostCard
        post={{
          id: "p3",
          post_id: "3",
          conversation_id: null,
          author_handle: "jack",
          text: "Read this https://example.com/local-first. now",
          created_at: "2026-06-03T00:00:00Z",
          url: "https://x.com/jack/status/3",
          post_type: "article",
          article_title: "Why local-first wins",
          media: [],
          urls: [],
          metrics: { likes: 1234, reposts: 31, replies: 12, impressions: 25400 },
        }}
        author={AUTHOR}
      />,
    );
    // X-native header: avatar image + bold name + @handle · date-link.
    expect((getByAltText("Jack") as HTMLImageElement).getAttribute("src")).toBe(
      "https://pbs.x.com/a.jpg",
    );
    expect(getByText("Jack")).toBeTruthy();
    expect(getByText(/@jack ·/)).toBeTruthy();
    expect(getByText("Article")).toBeTruthy();
    expect(getByText("Why local-first wins")).toBeTruthy();
    // Linkified with the trailing punctuation peeled OUT of the href.
    const a = getByText("https://example.com/local-first") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://example.com/local-first");
    // Metrics formatted (1.2K / 25K).
    expect(getByText(/1\.2K/)).toBeTruthy();
    expect(getByText(/25K/)).toBeTruthy();
  });

  it("media grid renders images; null created_at → — (INV-4)", () => {
    const { getByAltText, getByText } = render(
      <PostCard
        post={{
          id: "p4",
          post_id: "4",
          conversation_id: null,
          author_handle: "jack",
          text: "pic",
          created_at: null,
          url: null,
          post_type: "post",
          article_title: null,
          media: [
            { type: "photo", url: "https://pbs.x.com/m1.jpg", preview_image_url: null, alt_text: "a pic" },
          ],
          urls: [],
          metrics: null,
        }}
        author={AUTHOR}
      />,
    );
    expect((getByAltText("a pic") as HTMLImageElement).getAttribute("src")).toBe(
      "https://pbs.x.com/m1.jpg",
    );
    expect(getByText("—")).toBeTruthy();
  });
});

// tst_fe_x_thread_001 (S8, operator feedback): replies group UNDER their root
// post (ContentOS thread model: COALESCE(conversation_id, post_id) + author).
// Root first, replies in chronological order beneath; a reply to someone
// ELSE's conversation (root not in our data) stays its own standalone group.
describe("groupThreads (ContentOS thread grouping)", () => {
  const base = {
    author_handle: "jack",
    url: null,
    post_type: "post" as string | null,
    article_title: null,
    media: [],
    urls: [],
    metrics: null,
  };
  const posts = [
    // reply to own root (newest first, as posts.list returns)
    { ...base, id: "e3", post_id: "103", conversation_id: "100", post_type: "reply", text: "follow-up 2", created_at: "2026-06-03T00:00:00Z" },
    { ...base, id: "e2", post_id: "102", conversation_id: "100", post_type: "reply", text: "follow-up 1", created_at: "2026-06-02T00:00:00Z" },
    // reply into someone ELSE's conversation — no root here
    { ...base, id: "e9", post_id: "900", conversation_id: "555", post_type: "reply", text: "@mattpocockuk same", created_at: "2026-06-04T00:00:00Z" },
    // the root of the thread
    { ...base, id: "e1", post_id: "100", conversation_id: "100", text: "the root post", created_at: "2026-06-01T00:00:00Z" },
  ];

  it("groups root + own replies, root first then chronological", () => {
    const threads = groupThreads(posts);
    const thread = threads.find((t) => t[0]!.post_id === "100")!;
    expect(thread.map((p) => p.post_id)).toEqual(["100", "102", "103"]);
  });

  it("a reply to a foreign conversation stays standalone", () => {
    const threads = groupThreads(posts);
    const lone = threads.find((t) => t[0]!.post_id === "900")!;
    expect(lone).toHaveLength(1);
    expect(threads).toHaveLength(2);
  });

  it("threads order by most-recent activity, newest first", () => {
    const threads = groupThreads(posts);
    // foreign reply (Jun 4) is more recent than the thread's last reply (Jun 3).
    expect(threads[0]![0]!.post_id).toBe("900");
  });
});

describe("format helpers (ContentOS port)", () => {
  it("formatNumber: <1000 raw, 1.2K, 12K, 1.2M", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1234)).toBe("1.2K");
    expect(formatNumber(12345)).toBe("12K");
    expect(formatNumber(1_200_000)).toBe("1.2M");
  });

  it("relativeTime: null-guard (no 1970), relative forms", () => {
    expect(relativeTime(null).label).toBe("—");
    const now = Date.now();
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString()).label).toBe("5m ago");
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString()).label).toBe("3h ago");
    expect(relativeTime("2020-01-15T00:00:00Z").label).toBe("2020-01-15");
  });
});
