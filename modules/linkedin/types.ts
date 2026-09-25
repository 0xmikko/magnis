// Linkedin plugin — types. Mirrors the manifest schemas + the canonical source
// envelope. X and LinkedIn connectors both feed these via the `linkedin` surface.

export type Platform = "x" | "linkedin";

/** Canonical source envelope (same shape every plugin sync handler receives). */
export interface SyncEnvelope {
  source_id: string;
  surface: string;
  account_id: string;
  user_id: string;
  kind: string; // "snapshot" | "live" | "delete"
  remote_id?: string;
  cursor?: unknown;
  payload: Record<string, unknown>;
  timestamp: string;
}

/** `linkedin.profile.identity` record data. */
export interface ProfileIdentity {
  platform: Platform;
  /** The stable LinkedIn URN. A handle is renameable, so it can never be an
   * anchor — a profile arriving without this is dropped by ingest, which is
   * why it is required rather than optional. */
  urn: string;
  handle: string;
  display_name?: string;
  url?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  verified?: boolean | null;
  follower_count?: number | null;
}

/** `linkedin.post.content` record data. */
export interface PostContent {
  platform: Platform;
  post_id: string;
  author_handle: string;
  text: string;
  created_at?: string | null;
  url?: string | null;
  is_reply?: boolean | null;
  is_repost?: boolean | null;
  lang?: string | null;
  /** article > long_form > reply > post, as the connector classifies it. */
  post_type?: string;
  /** The article's headline, when the post is one. */
  article_title?: string;
  /** The thread this post belongs to. */
  conversation_id?: string;
  media?: {
    type?: string | null;
    url?: string | null;
    preview_image_url?: string | null;
    alt_text?: string | null;
  }[];
  urls?: { url?: string | null; expanded_url?: string | null; display_url?: string | null }[];
}

/** `linkedin.post.metrics` record data. */
export interface PostMetrics {
  likes?: number | null;
  reposts?: number | null;
  replies?: number | null;
  impressions?: number | null;
}

/** Record map for the typed GraphService. */

/** Canonical props derived by the host merge engine (from record mappings). */
export interface LinkedinCanonical {
  "linkedin.profile.display_name": string;
  "linkedin.profile.follower_count": number;
  "linkedin.post.text": string;
  "linkedin.post.created_at": string;
}

/** Envelope payload shapes (discriminated by `entity_type`). */
export interface ProfilePayload extends ProfileIdentity {
  entity_type: "profile";
  sync_pass?: string;
}
export interface PostPayload extends PostContent {
  entity_type: "post";
  metrics?: PostMetrics;
}

export interface PostsListParams {
  limit?: number;
  offset?: number;
  platform?: Platform;
  author_handle?: string;
}
export interface ProfilesListParams {
  limit?: number;
  offset?: number;
  platform?: Platform;
  search?: string;
}
export interface GetParams {
  id: string;
}

// Rich post fields: repost flag, reaction
// metrics (null = anysite shipped no counter) and post images.
export interface PostMediaItem {
  type: string | null;
  url: string | null;
  preview_image_url: string | null;
  alt_text: string | null;
}
export interface PostMetricsView {
  likes: number | null;
  reposts: number | null;
  replies: number | null;
}

export interface PostListItem {
  id: string;
  platform: Platform | null;
  author_handle: string | null;
  text: string;
  created_at: string | null;
  url: string | null;
  is_repost: boolean;
  media: PostMediaItem[];
  metrics: PostMetricsView | null;
}

export interface ProfileListItem {
  id: string;
  platform: Platform | null;
  handle: string | null;
  display_name: string | null;
  follower_count: number | null;
  avatar_url: string | null;
  /** Tracked but not yet fetched by sync: a
   * placeholder row shown as "Syncing…" until the real profile ingests. */
  pending?: boolean;
}

// Full profile for the detail header (profiles.get).
export interface ProfileDetail extends ProfileListItem {
  bio: string | null;
  url: string | null;
}
