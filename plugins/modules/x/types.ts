// X plugin — types. Mirrors the manifest schemas + the canonical source
// envelope. X and LinkedIn connectors both feed these via the `x` surface.

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

/** `x.profile.identity` facet data. */
export interface ProfileIdentity {
  platform: Platform;
  handle: string;
  display_name?: string;
  url?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  verified?: boolean | null;
  follower_count?: number | null;
}

/** `x.post.content` facet data. */
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
}

/** `x.post.metrics` facet data. */
export interface PostMetrics {
  likes?: number | null;
  reposts?: number | null;
  replies?: number | null;
  impressions?: number | null;
}

/** Facet map for the typed GraphService. */
export interface XFacets {
  "x.profile.identity": ProfileIdentity;
  "x.post.content": PostContent;
  "x.post.metrics": PostMetrics;
}

/** Canonical props derived by the host merge engine (from facet mappings). */
export interface XCanonical {
  "x.profile.display_name": string;
  "x.profile.follower_count": number;
  "x.post.text": string;
  "x.post.created_at": string;
}

/** Envelope payload shapes (discriminated by `entity_type`). */
export interface ProfilePayload extends ProfileIdentity {
  entity_type: "profile";
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

// Rich post fields (ContentOS ingest port).
export interface PostMediaItem {
  type: string | null;
  url: string | null;
  preview_image_url: string | null;
  alt_text: string | null;
}
export interface PostUrlEntity {
  url: string | null;
  expanded_url: string | null;
  display_url: string | null;
}
export interface PostMetricsView {
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  impressions: number | null;
}

export interface PostListItem {
  id: string;
  /** The remote tweet id — thread grouping key together with conversation_id. */
  post_id: string | null;
  conversation_id: string | null;
  platform: Platform | null;
  author_handle: string | null;
  text: string;
  created_at: string | null;
  url: string | null;
  /** article | long_form | reply | post — null for rows ingested before rich fields existed. */
  post_type: string | null;
  article_title: string | null;
  media: PostMediaItem[];
  urls: PostUrlEntity[];
  metrics: PostMetricsView | null;
}

export interface ProfileListItem {
  id: string;
  platform: Platform | null;
  handle: string | null;
  display_name: string | null;
  follower_count: number | null;
  avatar_url: string | null;
}

export interface ProfileDetail extends ProfileListItem {
  bio: string | null;
  url: string | null;
}
