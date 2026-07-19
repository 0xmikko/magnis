import type { Envelope, FetchArgs, FetchResult } from "@magnis/connector-sdk";
import { AnysiteClient, type FetchLike, type KolPost, type KolProfile } from "../../api";

const PLATFORM = "linkedin";
const RECENT_POSTS = 5;

// anysite `created_at` is epoch SECONDS (confirmed live, S4 spike) — but be
// robust to ms too: a 10-digit value (< 1e12) is seconds → ×1000.
function toIso(epoch: number | null): string | null {
  if (epoch === null || !Number.isFinite(epoch)) return null;
  const ms = epoch < 1e12 ? epoch * 1000 : epoch;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function profileEnvelope(handle: string, p: KolProfile): Envelope {
  return {
    surface: "linkedin",
    remote_id: `linkedin:profile:${p.urn || handle}`,
    kind: "snapshot",
    payload: {
      entity_type: "profile",
      platform: PLATFORM,
      handle,
      display_name: p.name,
      url: p.url || null,
      bio: p.headline || null,
      follower_count: p.followerCount || null,
      avatar_url: p.avatarUrl,
    },
  };
}

function postEnvelope(handle: string, post: KolPost): Envelope {
  return {
    surface: "linkedin",
    remote_id: `linkedin:post:${post.urn}`,
    kind: "live",
    payload: {
      entity_type: "post",
      platform: PLATFORM,
      post_id: post.urn,
      author_handle: handle,
      text: post.text,
      // anysite gives epoch seconds; normalise to ISO (null when absent).
      created_at: toIso(post.createdAt),
      url: post.url || null,
      is_repost: post.isRepost,
      // Same media shape as the x connector (INV-2: absent stays absent).
      ...(post.images.length
        ? {
            media: post.images.map((u) => ({
              type: "photo",
              url: u,
              preview_image_url: null,
              alt_text: null,
            })),
          }
        : {}),
      metrics: {
        likes: post.reactions,
        replies: post.comments,
        reposts: post.shares,
      },
    },
  };
}

/** Read-only fetch: resolve each TRACKED handle → profile + recent posts via
 * anysite (INV-1: only tracked handles queried). Missing key → fetch-time auth
 * error (DEC-7). A handle that resolves to no urn yields the profile only. */
export async function fetchLinkedIn(args: FetchArgs, fetchFn: FetchLike): Promise<FetchResult> {
  const key = typeof args.meta?.anysite_key === "string" ? args.meta.anysite_key : "";
  if (!key) {
    throw new Error("linkedin: missing anysite_key (set SOURCE_LINKEDIN_ANYSITE_KEY)");
  }
  const handles = args.tracked_handles ?? [];
  const client = new AnysiteClient(key, fetchFn);
  const envelopes: Envelope[] = [];
  for (const handle of handles) {
    const profile = await client.resolveProfile(handle);
    if (!profile) continue;
    envelopes.push(profileEnvelope(handle, profile));
    if (!profile.urn) continue; // no fsd_profile urn → can't fetch posts
    for (const post of await client.userPosts(profile.urn, RECENT_POSTS)) {
      envelopes.push(postEnvelope(handle, post));
    }
  }
  const cursor = typeof args.cursor === "number" ? args.cursor : 0;
  return { envelopes, nextCursor: cursor + 1, hasMore: false };
}
