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

/** `linkedin.profile.identity` facet data. */
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

/** `linkedin.post.content` facet data. */
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

/** `linkedin.post.metrics` facet data. */
export interface PostMetrics {
  likes?: number | null;
  reposts?: number | null;
  replies?: number | null;
  impressions?: number | null;
}

/** Facet map for the typed GraphService. */
export interface LinkedinFacets {
  "linkedin.profile.identity": ProfileIdentity;
  "linkedin.post.content": PostContent;
  "linkedin.post.metrics": PostMetrics;
}

/** Canonical props derived by the host merge engine (from facet mappings). */
export interface LinkedinCanonical {
  "linkedin.profile.display_name": string;
  "linkedin.profile.follower_count": number;
  "linkedin.post.text": string;
  "linkedin.post.created_at": string;
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

// Rich post fields (social-post-rendering S4/S9): repost flag, reaction
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
  /** Tracked but not yet fetched by sync (linkedin-add-flow LA-2): a
   * placeholder row shown as "Syncing…" until the real profile ingests. */
  pending?: boolean;
}

// Full profile for the detail header (profiles.get).
export interface ProfileDetail extends ProfileListItem {
  bio: string | null;
  url: string | null;
}
