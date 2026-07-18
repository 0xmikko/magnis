import type { FetchArgs, FetchResult, Envelope } from "@magnis/connector-sdk";

// mock-x — deterministic X fixture (SourceKind Mock). Returns canned profile +
// post envelopes for tracked handles only (INV-1), with NO network and NO
// credentials, so e2e exercises the x pipeline end-to-end (INV-2/6). The
// envelope shape matches the live `x` connector (entity_type "profile"/"post").
interface Fixture {
  user: { id: string; username: string; name: string; followers: number };
  /** Extra payload fields spread over the base post shape (rich S4 fields). */
  tweets: Array<{ id: string; text: string } & Record<string, unknown>>;
}

const FIXTURES: Record<string, Fixture> = {
  jack: {
    user: { id: "12", username: "jack", name: "Jack", followers: 99 },
    // One of each S4 format so the UI is verifiable without burning credits:
    // plain post, long-form (full text), article (title), media, repost.
    tweets: [
      { id: "1", text: "hello from the mock x connector", post_type: "post", conversation_id: "1" },
      {
        id: "2",
        text:
          "Long-form body far beyond the 280-char teaser.\n\n" +
          "It has multiple paragraphs, preserved newlines and reads like a mini-essay. " +
          "The connector stored the FULL note_tweet text, not the truncated preview — " +
          "which is exactly what INV-1 of the social-post-rendering plan demands.",
        post_type: "long_form",
        metrics: { likes: 42, reposts: 7, replies: 3, impressions: 1900 },
      },
      {
        id: "3",
        // Like the real API: article plain_text is the BODY — the title is only
        // in article_title, never duplicated as the first text line.
        text:
          "Owning your data beats renting it.\n\n" +
          "The sync layer is the product — see https://example.com/local-first.\n\n" +
          "Everything else is UI.",
        post_type: "article",
        article_title: "Why local-first wins",
        metrics: { likes: 128, reposts: 31, replies: 12, impressions: 25400 },
        urls: [
          {
            url: "https://t.co/abc",
            expanded_url: "https://example.com/local-first",
            display_url: "example.com/local-first",
          },
        ],
      },
      {
        id: "5",
        text: "And a follow-up thought threaded under the root post.",
        post_type: "reply",
        conversation_id: "1",
      },
      {
        id: "4",
        text: "shipping day 🚀 (with a picture)",
        post_type: "post",
        media: [
          {
            type: "photo",
            url: "https://placehold.co/600x338/png",
            preview_image_url: null,
            alt_text: "a launch screenshot",
          },
        ],
        metrics: { likes: 9, reposts: 2, replies: 1, impressions: 400 },
      },
    ],
  },
};

function envelopes(f: Fixture): Envelope[] {
  return [
    {
      surface: "x",
      remote_id: `x:profile:${f.user.id}`,
      kind: "snapshot",
      payload: {
        entity_type: "profile",
        platform: "x",
        handle: f.user.username,
        display_name: f.user.name,
        url: `https://x.com/${f.user.username}`,
        follower_count: f.user.followers,
      },
    },
    ...f.tweets.map(
      ({ id, text, ...rich }): Envelope => ({
        surface: "x",
        remote_id: `x:post:${id}`,
        kind: "live",
        payload: {
          entity_type: "post",
          platform: "x",
          post_id: id,
          author_handle: f.user.username,
          text,
          created_at: `2026-06-0${id}T00:00:00Z`,
          url: `https://x.com/${f.user.username}/status/${id}`,
          metrics: { likes: 5, reposts: 1, replies: 2 },
          ...rich,
        },
      }),
    ),
  ];
}

export async function fetchMockX(args: FetchArgs): Promise<FetchResult> {
  const cursor = typeof args.cursor === "number" ? args.cursor : 0;
  if (cursor > 0) {
    return { envelopes: [], nextCursor: cursor, hasMore: false };
  }
  const tracked = args.tracked_handles ?? Object.keys(FIXTURES);
  const out: Envelope[] = [];
  for (const handle of tracked) {
    const f = FIXTURES[handle];
    if (f) out.push(...envelopes(f));
  }
  return { envelopes: out, nextCursor: 1, hasMore: false };
}
