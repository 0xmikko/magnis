// X plugin — pure helpers (no graph/host access). Payload field readers +
// rich-post projection. Extracted from module/service.ts so the class body stays
// handler-only.

import type { PostMediaItem, PostMetricsView, PostUrlEntity } from "../types.ts";

/** String value at `k`, else undefined. */
export function str(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
}

// Rich post fields (social-post-rendering S4): pass the connector's enriched
// payload through to list/get responses. Pre-S4 rows lack them → null/[].
export function richPostFields(d: Record<string, unknown>): {
  post_type: string | null;
  article_title: string | null;
  media: PostMediaItem[];
  urls: PostUrlEntity[];
  metrics: PostMetricsView | null;
} {
  const m = d.metrics;
  const num = (o: Record<string, unknown>, k: string): number | null =>
    typeof o[k] === "number" ? o[k] : null;
  return {
    post_type: str(d, "post_type") ?? null,
    article_title: str(d, "article_title") ?? null,
    media: Array.isArray(d.media) ? (d.media as PostMediaItem[]) : [],
    urls: Array.isArray(d.urls) ? (d.urls as PostUrlEntity[]) : [],
    metrics:
      m && typeof m === "object"
        ? {
            likes: num(m as Record<string, unknown>, "likes"),
            reposts: num(m as Record<string, unknown>, "reposts"),
            replies: num(m as Record<string, unknown>, "replies"),
            impressions: num(m as Record<string, unknown>, "impressions"),
          }
        : null,
  };
}
