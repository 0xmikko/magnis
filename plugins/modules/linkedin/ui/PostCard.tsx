import type { JSX } from "react";
import { Avatar, Card, Icon, Row, Stack, Tag, Text } from "@magnis/host/ui";
import type { IconName } from "@magnis/host/ui";
import { initialsFromName } from "@magnis/host/utils";

// Content blockers kill direct hotlinks to these CDNs (ERR_BLOCKED_BY_CLIENT,
// live-observed 2026-07-02) — route them through the backend's same-origin
// media proxy. Other URLs pass through untouched.
const PROXIED_HOSTS = ["media.licdn.com", "pbs.twimg.com"];
export function proxiedMediaUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    if (PROXIED_HOSTS.includes(new URL(url).host)) {
      return `/api/media-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    return url;
  }
  return url;
}


// ContentOS render model, LinkedIn form, X-native card layout (S5/S7): header
// = avatar + bold name + @handle · date (linked), body, icon metrics row.
// anysite has no media/urls/article yet — the card renders what exists.

export interface LinkedInRichPost {
  id: string;
  author_handle: string | null;
  text: string;
  created_at: string | null;
  url: string | null;
  is_repost: boolean;
  media: {
    type: string | null;
    url: string | null;
    preview_image_url: string | null;
    alt_text: string | null;
  }[];
  metrics: { likes: number | null; reposts: number | null; replies: number | null } | null;
}

export interface PostAuthor {
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

/** ContentOS formatNumber: <1000 raw, 1.2K, 12K, 1.2M. */
export function formatNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${String(Math.round(n / 1000))}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** ContentOS relativeTime with the null-guard (new Date(null) = 1970 trap —
 * INV-4): relative label + absolute ISO for the tooltip. */
export function relativeTime(v: string | null): { label: string; title: string } {
  if (!v) return { label: "—", title: "" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { label: "—", title: "" };
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const title = d.toISOString();
  if (mins < 1) return { label: "just now", title };
  if (mins < 60) return { label: `${String(mins)}m ago`, title };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { label: `${String(hours)}h ago`, title };
  const days = Math.floor(hours / 24);
  if (days < 30) return { label: `${String(days)}d ago`, title };
  return { label: title.slice(0, 10), title };
}

function MediaGrid({ media }: { media: LinkedInRichPost["media"] }): JSX.Element | null {
  const items = media.filter((m) => m.url ?? m.preview_image_url);
  if (items.length === 0) return null;
  const cols = items.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <div className={`grid gap-2 ${cols}`}>
      {items.map((m, i) => (
        <a
          key={`${String(m.url ?? m.preview_image_url)}-${String(i)}`}
          href={proxiedMediaUrl(m.url ?? m.preview_image_url) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src={proxiedMediaUrl(m.url ?? m.preview_image_url) ?? undefined}
            alt={m.alt_text ?? ""}
            loading="lazy"
            className="aspect-video w-full rounded-xl border border-edge object-cover"
          />
        </a>
      ))}
    </div>
  );
}

function MetricStat({ icon, value }: { icon: IconName; value: number | null }): JSX.Element | null {
  if (value === null) return null;
  return (
    <Row gap={1} align="center">
      <Icon name={icon} size={14} className="text-content-tertiary" />
      <Text variant="caption">{formatNumber(value)}</Text>
    </Row>
  );
}

function MetricsRow({ metrics }: { metrics: LinkedInRichPost["metrics"] }): JSX.Element | null {
  if (!metrics) return null;
  if (metrics.replies === null && metrics.reposts === null && metrics.likes === null) return null;
  return (
    <Row gap={5} align="center" className="mt-1">
      <MetricStat icon="message-circle" value={metrics.replies} />
      <MetricStat icon="repeat-2" value={metrics.reposts} />
      <MetricStat icon="heart" value={metrics.likes} />
    </Row>
  );
}

export function PostCard({
  post,
  author,
}: {
  post: LinkedInRichPost;
  author: PostAuthor;
}): JSX.Element {
  const when = relativeTime(post.created_at);
  const name = author.name ?? author.handle ?? "";
  const handle = post.author_handle ?? author.handle;

  return (
    <Card>
      <Stack gap={2}>
        <Row gap={2} align="center" justify="between">
          <Row gap={2} align="center" className="min-w-0">
            <Avatar
              label={initialsFromName(name)}
              size="sm"
              imageSrc={proxiedMediaUrl(author.avatar_url) ?? undefined}
              imageAlt={name}
            />
            <Text variant="body" weight="semibold" truncate noShrink>
              {name}
            </Text>
            <Text variant="caption" truncate>
              {handle ? `@${handle} · ` : ""}
              {post.url ? (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={when.title}
                  className="hover:underline"
                >
                  {when.label}
                </a>
              ) : (
                <span title={when.title}>{when.label}</span>
              )}
            </Text>
          </Row>
          {post.is_repost && <Tag label="Repost" variant="teal" mode="subtle" />}
        </Row>
        <Text variant="body" leading="relaxed" className="whitespace-pre-wrap">
          {post.text}
        </Text>
        <MediaGrid media={post.media} />
        <MetricsRow metrics={post.metrics} />
      </Stack>
    </Card>
  );
}
