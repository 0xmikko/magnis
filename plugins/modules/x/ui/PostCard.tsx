import type { JSX, ReactNode } from "react";
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


// ContentOS render model in X-native card form:
// header = avatar + bold name + @handle · date (the date links to the post),
// body, media grid, icon metrics row — mirroring how X itself lays a tweet
// out. Design-system primitives only; format helpers are verbatim ports of
// content-os frontend/src/lib/format.ts.

export interface RichPost {
  id: string;
  post_id: string | null;
  conversation_id: string | null;
  author_handle: string | null;
  text: string;
  created_at: string | null;
  url: string | null;
  post_type: string | null;
  article_title: string | null;
  media: {
    type: string | null;
    url: string | null;
    preview_image_url: string | null;
    alt_text: string | null;
  }[];
  urls: { url: string | null; expanded_url: string | null; display_url: string | null }[];
  metrics: {
    likes: number | null;
    reposts: number | null;
    replies: number | null;
    impressions?: number | null;
  } | null;
}

/** The tracked profile whose feed this card belongs to (header identity). */
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

/** ContentOS relativeTime with the null-guard (new Date(null) = 1970 trap):
 * relative label + absolute ISO for the tooltip. */
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

const URL_RE = /(https?:\/\/[^\s)]+)/g;

/** ContentOS ArticleBody.renderInline: linkify URLs with the trailing
 * punctuation peel so citation-style endings stay text. */
export function linkifyText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    let url = match[0];
    let trailing = "";
    while (/[.,;:)!?\]]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (match.index > lastIdx) out.push(text.slice(lastIdx, match.index));
    out.push(
      <a
        key={`url-${String(match.index)}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:underline break-all"
      >
        {url}
      </a>,
    );
    if (trailing) out.push(trailing);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out;
}

/** ContentOS thread grouping (repo.getThreadSegments): key =
 * COALESCE(conversation_id, post_id); within a thread the root (post_id ==
 * conversation_id) comes first, replies follow chronologically. Threads order
 * by most-recent activity, newest first — replies read UNDER their post. */
export function groupThreads(posts: readonly RichPost[]): RichPost[][] {
  const byKey = new Map<string, RichPost[]>();
  for (const p of posts) {
    const key = p.conversation_id ?? p.post_id ?? p.id;
    const group = byKey.get(key);
    if (group) group.push(p);
    else byKey.set(key, [p]);
  }
  const time = (p: RichPost): number => {
    const t = p.created_at ? Date.parse(p.created_at) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const threads = [...byKey.entries()].map(([key, group]) => {
    group.sort((a, b) => {
      const aRoot = a.post_id === key ? 0 : 1;
      const bRoot = b.post_id === key ? 0 : 1;
      if (aRoot !== bRoot) return aRoot - bRoot;
      return time(a) - time(b);
    });
    return group;
  });
  threads.sort((a, b) => Math.max(...b.map(time)) - Math.max(...a.map(time)));
  return threads;
}

const TYPE_TAGS: Record<string, { label: string; variant: "blue" | "purple" | "default" }> = {
  article: { label: "Article", variant: "blue" },
  long_form: { label: "Long-form", variant: "purple" },
  reply: { label: "Reply", variant: "default" },
};

function MediaGrid({ media }: { media: RichPost["media"] }): JSX.Element | null {
  const items = media.filter((m) => m.url ?? m.preview_image_url);
  if (items.length === 0) return null;
  // ContentOS TweetAttachments: 1 column for a single image, 2 for more.
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

function MetricStat({ icon, value }: { icon: IconName; value: number | null | undefined }): JSX.Element | null {
  if (value === null || value === undefined) return null;
  return (
    <Row gap={1} align="center">
      <Icon name={icon} size={14} className="text-content-tertiary" />
      <Text variant="caption">{formatNumber(value)}</Text>
    </Row>
  );
}

// X-native metrics order: replies, reposts, likes, views.
function MetricsRow({ metrics }: { metrics: RichPost["metrics"] }): JSX.Element | null {
  if (!metrics) return null;
  const hasAny =
    metrics.replies !== null ||
    metrics.reposts !== null ||
    metrics.likes !== null ||
    metrics.impressions !== null;
  if (!hasAny) return null;
  return (
    <Row gap={5} align="center" className="mt-1">
      <MetricStat icon="message-circle" value={metrics.replies} />
      <MetricStat icon="repeat-2" value={metrics.reposts} />
      <MetricStat icon="heart" value={metrics.likes} />
      <MetricStat icon="eye" value={metrics.impressions} />
    </Row>
  );
}

/** One thread segment: X-style row — avatar column (with the connecting rail
 * below, ContentOS TweetThread) + name/@handle · date, body, media, metrics. */
function ThreadSegment({
  post,
  author,
  isLast,
}: {
  post: RichPost;
  author: PostAuthor;
  isLast: boolean;
}): JSX.Element {
  const when = relativeTime(post.created_at);
  // Inside a thread "Reply" is implied by the rail — only content tags show.
  const typeTag =
    post.post_type && post.post_type !== "reply" ? TYPE_TAGS[post.post_type] : undefined;
  const isArticle = post.post_type === "article";
  const name = author.name ?? author.handle ?? "";
  const handle = post.author_handle ?? author.handle;

  return (
    <Row gap={2} align="stretch">
      <div className="flex shrink-0 flex-col items-center">
        <Avatar
          label={initialsFromName(name)}
          size="sm"
          imageSrc={proxiedMediaUrl(author.avatar_url) ?? undefined}
          imageAlt={name}
        />
        {!isLast && <div className="mt-1 w-px flex-1 bg-edge" />}
      </div>
      <Stack gap={1} className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
        <Row gap={2} align="center" justify="between">
          <Row gap={2} align="center" className="min-w-0">
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
          {typeTag && <Tag label={typeTag.label} variant={typeTag.variant} mode="subtle" />}
        </Row>
        {isArticle && post.article_title && (
          <Text variant="title" leading="tight">
            {post.article_title}
          </Text>
        )}
        <Text variant="body" leading="relaxed" className="whitespace-pre-wrap">
          {isArticle ? linkifyText(post.text) : post.text}
        </Text>
        <MediaGrid media={post.media} />
        <MetricsRow metrics={post.metrics} />
      </Stack>
    </Row>
  );
}

/** A conversation card: the root post with its replies threaded beneath it
 * (operator feedback — replies are analysed under their post, ContentOS
 * TweetThread layout with the avatar rail). */
export function ThreadCard({
  posts,
  author,
}: {
  posts: readonly RichPost[];
  author: PostAuthor;
}): JSX.Element {
  return (
    <Card>
      <Stack gap={0}>
        {posts.map((p, i) => (
          <ThreadSegment key={p.id} post={p} author={author} isLast={i === posts.length - 1} />
        ))}
      </Stack>
    </Card>
  );
}

export function PostCard({ post, author }: { post: RichPost; author: PostAuthor }): JSX.Element {
  const when = relativeTime(post.created_at);
  const typeTag = post.post_type ? TYPE_TAGS[post.post_type] : undefined;
  const isArticle = post.post_type === "article";
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
          {typeTag && <Tag label={typeTag.label} variant={typeTag.variant} mode="subtle" />}
        </Row>
        {isArticle && post.article_title && (
          <Text variant="title" leading="tight">
            {post.article_title}
          </Text>
        )}
        <Text variant="body" leading="relaxed" className="whitespace-pre-wrap">
          {isArticle ? linkifyText(post.text) : post.text}
        </Text>
        <MediaGrid media={post.media} />
        <MetricsRow metrics={post.metrics} />
      </Stack>
    </Card>
  );
}
