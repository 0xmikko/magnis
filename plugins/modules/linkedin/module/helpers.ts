// LinkedIn plugin — helpers shared inside module/. Module-SPECIFIC parsing that
// does not belong in the SDK (contrast: the domain-neutral `str`/`num` payload
// coercers were promoted to @magnis/plugin-sdk).

import { num } from "@magnis/plugin-sdk";
import type { PostMediaItem, PostMetricsView } from "../types.ts";

/// Rich post fields (social-post-rendering S4): repost flag + reaction metrics +
/// media pass through from the anysite payload. Pre-S4 rows lack them → false/[]/null.
export function richPostFields(d: Record<string, unknown>): {
  is_repost: boolean;
  media: PostMediaItem[];
  metrics: PostMetricsView | null;
} {
  const m = d.metrics;
  return {
    is_repost: d.is_repost === true,
    media: Array.isArray(d.media) ? (d.media as PostMediaItem[]) : [],
    metrics:
      m && typeof m === "object"
        ? {
            likes: num(m as Record<string, unknown>, "likes"),
            reposts: num(m as Record<string, unknown>, "reposts"),
            replies: num(m as Record<string, unknown>, "replies"),
          }
        : null,
  };
}
