import type { FetchArgs, FetchResult, Envelope } from "@magnis/connector-sdk";

// mock-linkedin — LinkedIn fixture (SourceKind Mock; ENABLED_SOURCES-gated).
// No network, no credentials — same envelope shape as the live `linkedin`
// connector for tests / e2e (INV-2/6). Read-only (INV-5).
interface Fixture {
  handle: string;
  urn: string;
  name: string;
  followers: number;
  post: { urn: string; text: string };
}

const FIXTURES: Record<string, Fixture> = {
  anndoe: {
    handle: "anndoe",
    urn: "ACoAAB123",
    name: "Ann Doe",
    followers: 4200,
    post: { urn: "urn:li:activity:999", text: "hello from the mock linkedin connector" },
  },
};

function envelopes(f: Fixture): Envelope[] {
  return [
    {
      surface: "linkedin",
      remote_id: `linkedin:profile:${f.urn}`,
      kind: "snapshot",
      payload: {
        entity_type: "profile",
        platform: "linkedin",
        handle: f.handle,
        display_name: f.name,
        url: `https://linkedin.com/in/${f.handle}`,
        follower_count: f.followers,
      },
    },
    {
      surface: "linkedin",
      remote_id: `linkedin:post:${f.post.urn}`,
      kind: "live",
      payload: {
        entity_type: "post",
        platform: "linkedin",
        post_id: f.post.urn,
        author_handle: f.handle,
        text: f.post.text,
        created_at: "2026-06-01T00:00:00Z",
        metrics: { likes: 10, replies: 2, reposts: 1 },
      },
    },
  ];
}

export async function fetchMockLinkedIn(args: FetchArgs): Promise<FetchResult> {
  if ((args.cursor ?? 0) > 0) {
    return { envelopes: [], nextCursor: args.cursor ?? 0, hasMore: false };
  }
  const tracked = args.tracked_handles ?? Object.keys(FIXTURES);
  const out: Envelope[] = [];
  for (const handle of tracked) {
    const f = FIXTURES[handle];
    if (f) out.push(...envelopes(f));
  }
  return { envelopes: out, nextCursor: 1, hasMore: false };
}
