import { describe, test, expect } from "bun:test";
import { fetchLinkedIn } from "./fetch";
import type { FetchLike } from "../../api";

// Fake anysite API: records URLs (to assert call counts), answers the two POST read
// endpoints with canned data. NO live network.
function fakeApi() {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    calls.push(url);
    const ok = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
    if (url.endsWith("/api/linkedin/user")) {
      return ok({
        name: "Ann Doe",
        urn: { type: "fsd_profile", value: "ACoAAB123" },
        headline: "Builder",
        follower_count: 4200,
        url: "https://linkedin.com/in/anndoe",
        // live-probed 2026-07-02: anysite DOES ship the avatar as `image`.
        image: "https://media.licdn.com/dms/image/v2/abc/photo.jpg",
      });
    }
    if (url.endsWith("/api/linkedin/user/posts")) {
      return ok({
        posts: [
          {
            urn: "urn:li:activity:999",
            share_url: "https://linkedin.com/feed/update/999",
            text: "shipping",
            created_at: 1_700_000_000, // anysite epoch is SECONDS (confirmed live)
            reactions: [{ type: "like", count: 7 }, { type: "praise", count: 3 }],
            comment_count: 2,
            share_count: 1,
            images: ["https://media.licdn.com/dms/image/post-1.jpg"],
          },
          {
            // empty reshare: content + images live in the NESTED original, and
            // counts are NULL (anysite returns no counters here) — they must
            // stay null, never coerce to 0 (live probe 2026-07-02).
            urn: "urn:li:activity:1000",
            share_url: null,
            text: null,
            created_at: 1_700_000_100,
            is_empty_repost: true,
            reactions: null,
            comment_count: null,
            share_count: null,
            images: null,
            repost: {
              text: "original body",
              url: "https://linkedin.com/feed/update/555",
              images: ["https://media.licdn.com/dms/image/orig-1.jpg", "https://media.licdn.com/dms/image/orig-2.jpg"],
              reactions: null,
              comment_count: null,
            },
          },
        ],
      });
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
  };
  return { fetchFn, calls };
}

const META = { meta: { api_key: "k" } };

describe("anysite connector fetch (linkedin surface)", () => {
  test("tst_li_001 tracked handle → profile + post envelopes (anysite mapped)", async () => {
    const { fetchFn } = fakeApi();
    const { envelopes } = await fetchLinkedIn(
      { surface: "linkedin", tracked_handles: ["anndoe"], ...META },
      fetchFn,
    );
    const profile = envelopes.find((e) => e.payload.entity_type === "profile")!;
    const post = envelopes.find((e) => e.payload.entity_type === "post")!;
    expect(profile.payload.platform).toBe("linkedin");
    expect(profile.payload.handle).toBe("anndoe");
    expect(profile.payload.follower_count).toBe(4200);
    expect(profile.remote_id).toBe("linkedin:profile:ACoAAB123");
    expect(post.payload.author_handle).toBe("anndoe");
    expect(post.payload.text).toBe("shipping");
    // reactions array summed (7 + 3 = 10).
    expect((post.payload.metrics as { likes: number }).likes).toBe(10);
    // epoch SECONDS → ISO (anysite created_at is seconds, not ms).
    expect(post.payload.created_at).toBe("2023-11-14T22:13:20.000Z");
    expect(post.remote_id).toBe("linkedin:post:urn:li:activity:999");
  });

  // tst_li_005 (operator feedback 2026-07-02): avatar + post images + honest
  // null metrics — everything anysite actually ships must reach the payload.
  test("tst_li_005 avatar, images (own + nested repost), null metrics stay null", async () => {
    const { fetchFn } = fakeApi();
    const { envelopes } = await fetchLinkedIn(
      { surface: "linkedin", tracked_handles: ["anndoe"], ...META },
      fetchFn,
    );
    const profile = envelopes.find((e) => e.payload.entity_type === "profile")!;
    expect(profile.payload.avatar_url).toBe("https://media.licdn.com/dms/image/v2/abc/photo.jpg");

    const own = envelopes.find((e) => e.remote_id === "linkedin:post:urn:li:activity:999")!;
    expect(own.payload.media).toEqual([
      { type: "photo", url: "https://media.licdn.com/dms/image/post-1.jpg", preview_image_url: null, alt_text: null },
    ]);

    const reshare = envelopes.find((e) => e.remote_id === "linkedin:post:urn:li:activity:1000")!;
    // images fall back to the nested original, like the text does.
    expect((reshare.payload.media as Array<{ url: string }>).map((m) => m.url)).toEqual([
      "https://media.licdn.com/dms/image/orig-1.jpg",
      "https://media.licdn.com/dms/image/orig-2.jpg",
    ]);
    // NULL counters stay null — no lying zeros.
    expect(reshare.payload.metrics).toEqual({ likes: null, replies: null, reposts: null });
  });

  test("tst_li_002 empty tracked set → ZERO API calls (only tracked handles are ever fetched)", async () => {
    const { fetchFn, calls } = fakeApi();
    const { envelopes } = await fetchLinkedIn({ surface: "linkedin", tracked_handles: [], ...META }, fetchFn);
    expect(envelopes).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  test("tst_li_003 missing key → auth error at fetch, not at registration", async () => {
    const { fetchFn } = fakeApi();
    await expect(
      fetchLinkedIn({ surface: "linkedin", tracked_handles: ["anndoe"] }, fetchFn),
    ).rejects.toThrow(/api_key/);
  });

  test("tst_li_004 points exhausted (401) → RateLimitError (backoff, not dead)", async () => {
    const { RateLimitError } = await import("@magnis/connector-sdk");
    const fetchFn = async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => '{"detail":"Points limit exhausted, required at least 9 points"}',
    });
    await expect(
      fetchLinkedIn({ surface: "linkedin", tracked_handles: ["anndoe"], ...META }, fetchFn),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
