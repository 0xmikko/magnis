import type { JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { proxiedMediaUrl } from "./PostCard";

// SINGLE canonical X-post card (docs/frontend/module-standard.md: ONE COMPONENT
// PER ENTITY). Reads the merged canonical + x.post.content facet fields the host
// passes as `data` (text/author_handle/created_at/metrics). Read-only.

function fmtDate(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length === 0) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString();
}

function metricLine(data: Readonly<Record<string, unknown>>): string | undefined {
  const m = (data.metrics ?? {}) as Record<string, unknown>;
  const n = (k: string): number | undefined => (typeof m[k] === "number" ? (m[k]) : undefined);
  const parts: string[] = [];
  if (n("likes") != null) parts.push(`♥ ${n("likes")}`);
  if (n("reposts") != null) parts.push(`⇄ ${n("reposts")}`);
  if (n("replies") != null) parts.push(`💬 ${n("replies")}`);
  return parts.length ? parts.join("  ") : undefined;
}

export function XPostCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const author = (data.author_handle as string | undefined) ?? undefined;
  const text = (data.text as string | undefined) ?? (data.name as string | undefined) ?? "";
  const when = fmtDate(data.created_at);
  const metrics = metricLine(data);

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {author ? `@${author}` : "X post"}
          {when && <span className="ml-2 text-[10px] text-content-tertiary">{when}</span>}
        </span>
        <span className="mt-0.5 block text-[11px] text-content-secondary line-clamp-3">{text}</span>
        {metrics && (
          <span className="mt-1 block text-[10px] text-content-tertiary">{metrics}</span>
        )}
      </div>
    </BaseEntityCard>
  );
}

export function XProfileCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const name =
    (data.display_name as string | undefined) ??
    (data.name as string | undefined) ??
    (data.handle as string | undefined) ??
    "X profile";
  const handle = (data.handle as string | undefined) ?? undefined;
  const followers =
    typeof data.follower_count === "number" ? (data.follower_count) : undefined;
  const bio = (data.bio as string | undefined) ?? undefined;
  const avatar = (data.avatar_url as string | undefined) ?? undefined;
  const subtitle = handle
    ? `@${handle}${followers != null ? ` · ${followers.toLocaleString()} followers` : ""}`
    : undefined;

  return (
    <BaseEntityCard {...props}>
      {avatar && (
        <img
          src={proxiedMediaUrl(avatar) ?? undefined}
          alt={name}
          className="h-8 w-8 shrink-0 rounded-full object-cover"
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {name}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[11px] text-content-secondary">{subtitle}</span>
        )}
        {bio && (
          <span className="mt-0.5 block text-[11px] text-content-tertiary line-clamp-2">{bio}</span>
        )}
      </div>
    </BaseEntityCard>
  );
}
