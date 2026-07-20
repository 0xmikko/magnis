import { describe, test, expect } from "bun:test";
import { fetchX } from "./fetch";
import type { FetchLike } from "../../api";

// A fake X v2 API: records every URL hit (to assert call counts) and
// answers the two read endpoints with canned data. NO live network.
function fakeApi() {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    calls.push(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });
    if (url.includes("/2/users/by/username/jack")) {
      return ok({
        id: "12",
        username: "jack",
        name: "Jack",
        description: "ceo",
        verified: true,
        public_metrics: { followers_count: 99 },
      });
    }
    if (url.includes("/2/users/12/tweets")) {
      return ok([
        {
          id: "1",
          text: "hello",
          created_at: "2026-06-01T00:00:00Z",
          lang: "en",
          public_metrics: { like_count: 5, retweet_count: 1, reply_count: 2 },
        },
      ]);
    }
    return { ok: false, status: 404, json: async () => ({ detail: "not found" }) };
  };
  return { fetchFn, calls };
}

const META = { meta: { bearer_token: "tok" } };

describe("x connector fetch", () => {
  test("tst_x_001 tracked handle → profile + post envelopes", async () => {
    const { fetchFn } = fakeApi();
    const { envelopes } = await fetchX(
      { surface: "x", tracked_handles: ["jack"], ...META },
      fetchFn,
    );
    const profile = envelopes.find((e) => e.payload.entity_type === "profile")!;
    const post = envelopes.find((e) => e.payload.entity_type === "post")!;
    expect(profile.payload.platform).toBe("x");
    expect(profile.payload.handle).toBe("jack");
    expect(profile.payload.follower_count).toBe(99);
    expect(profile.remote_id).toBe("x:profile:12");
    expect(post.payload.author_handle).toBe("jack");
    expect(post.payload.text).toBe("hello");
    expect((post.payload.metrics as { likes: number }).likes).toBe(5);
    expect(post.remote_id).toBe("x:post:1");
  });

  test("tst_x_002 untracked handle → ZERO API calls (INV-1)", async () => {
    const { fetchFn, calls } = fakeApi();
    // jack is not in the tracked set → never queried; an empty set → no loop.
    const r1 = await fetchX({ surface: "x", tracked_handles: [], ...META }, fetchFn);
    expect(r1.envelopes).toHaveLength(0);
    expect(calls).toHaveLength(0);

    // a different (untracked-here) handle that 404s still only hits the lookup
    // for the handles actually in the set.
    await fetchX({ surface: "x", tracked_handles: ["ghost"], ...META }, fetchFn);
    expect(calls.every((u) => u.includes("/username/ghost"))).toBe(true);
  });

  test("tst_x_003 missing bearer → auth error at fetch (DEC-7)", async () => {
    const { fetchFn } = fakeApi();
    await expect(
      fetchX({ surface: "x", tracked_handles: ["jack"] }, fetchFn),
    ).rejects.toThrow(/bearer_token/);
  });

  test("tst_x_004 unknown handle (404) → skipped, no envelope", async () => {
    const { fetchFn } = fakeApi();
    const { envelopes } = await fetchX(
      { surface: "x", tracked_handles: ["ghost"], ...META },
      fetchFn,
    );
    expect(envelopes).toHaveLength(0);
  });

  test("tst_x_005 429 → RateLimitError with retry-after (S6 backoff)", async () => {
    const { RateLimitError } = await import("@magnis/connector-sdk");
    const fetchFn = async () => ({
      ok: false,
      status: 429,
      headers: { get: (n: string) => (n === "retry-after" ? "30" : null) },
      json: async () => ({}),
    });
    await expect(
      fetchX({ surface: "x", tracked_handles: ["jack"], ...META }, fetchFn),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  test("tst_x_007 credits depleted (402) → RateLimitError (backoff, not dead)", async () => {
    const { RateLimitError } = await import("@magnis/connector-sdk");
    const fetchFn = async () => ({
      ok: false,
      status: 402,
      headers: { get: () => null },
      json: async () => ({ detail: "credits depleted" }),
    });
    await expect(
      fetchX({ surface: "x", tracked_handles: ["jack"], ...META }, fetchFn),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  // ── ContentOS ingest port ─────────────────────────────────────────────────
  // Full text precedence: article.plain_text ?? note_tweet.text ?? text.
  // post_type / media / urls / conversation_id present only when the API
  // provides them.

  function richApi() {
    const fetchFn: FetchLike = async (url) => {
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (url.includes("/2/users/by/username/jack")) {
        return ok({ data: { id: "12", username: "jack", name: "Jack" } });
      }
      if (url.includes("/2/users/12/tweets")) {
        // Assert the request carries the rich fields + media expansion.
        if (
          !url.includes("note_tweet") ||
          !url.includes("article") ||
          !url.includes("attachments.media_keys") ||
          !url.includes("media.fields")
        ) {
          return { ok: false, status: 400, json: async () => ({ detail: "missing fields" }) };
        }
        return ok({
          data: [
            {
              id: "t1",
              text: "short teaser…",
              note_tweet: { text: "the FULL long-form body that x truncates in .text" },
              created_at: "2026-06-01T00:00:00Z",
              conversation_id: "c-100",
            },
            {
              id: "t2",
              text: "article teaser…",
              article: { title: "My Article", plain_text: "Full article body.\n\nSecond para." },
            },
            {
              id: "t3",
              text: "look at this pic",
              attachments: { media_keys: ["m1", "m404"] },
              entities: {
                urls: [{ url: "https://t.co/x", expanded_url: "https://example.com/a", display_url: "example.com/a" }],
              },
            },
          ],
          includes: {
            media: [
              { media_key: "m1", type: "photo", url: "https://pbs.x.com/m1.jpg", alt_text: "a pic" },
            ],
          },
        });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    return fetchFn;
  }

  test("tst_x_008 note_tweet → FULL text + post_type long_form (INV-1)", async () => {
    const { envelopes } = await fetchX(
      { surface: "x", tracked_handles: ["jack"], ...META },
      richApi(),
    );
    const p = envelopes.find((e) => e.remote_id === "x:post:t1")!.payload;
    expect(p.text).toBe("the FULL long-form body that x truncates in .text");
    expect(p.post_type).toBe("long_form");
    expect(p.conversation_id).toBe("c-100");
  });

  test("tst_x_009 article → plain_text + title + post_type article (INV-1)", async () => {
    const { envelopes } = await fetchX(
      { surface: "x", tracked_handles: ["jack"], ...META },
      richApi(),
    );
    const p = envelopes.find((e) => e.remote_id === "x:post:t2")!.payload;
    expect(p.text).toBe("Full article body.\n\nSecond para.");
    expect(p.post_type).toBe("article");
    expect(p.article_title).toBe("My Article");
  });

  test("tst_x_010 media keys resolve against includes; urls mapped; absent stays absent (INV-2)", async () => {
    const { envelopes } = await fetchX(
      { surface: "x", tracked_handles: ["jack"], ...META },
      richApi(),
    );
    const p3 = envelopes.find((e) => e.remote_id === "x:post:t3")!.payload;
    // m404 has no includes entry → dropped, not a broken item.
    expect(p3.media).toEqual([
      { type: "photo", url: "https://pbs.x.com/m1.jpg", preview_image_url: null, alt_text: "a pic" },
    ]);
    expect(p3.urls).toEqual([
      { url: "https://t.co/x", expanded_url: "https://example.com/a", display_url: "example.com/a" },
    ]);
    expect(p3.post_type).toBe("post");

    // Plain tweet (t1) carries NO media/urls keys at all.
    const p1 = envelopes.find((e) => e.remote_id === "x:post:t1")!.payload;
    expect("media" in p1).toBe(false);
    expect("urls" in p1).toBe(false);
  });

  test("tst_x_006 re-poll is idempotent — identical remote_ids (INV-4)", async () => {
    const { fetchFn } = fakeApi();
    const a = await fetchX({ surface: "x", tracked_handles: ["jack"], ...META }, fetchFn);
    const b = await fetchX({ surface: "x", tracked_handles: ["jack"], ...META }, fetchFn);
    // Stable remote_ids → the x module upserts (no dup entity) on re-poll.
    expect(a.envelopes.map((e) => e.remote_id)).toEqual(b.envelopes.map((e) => e.remote_id));
  });
});
