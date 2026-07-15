import { useContext, type JSX } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";
import { formatFileSize } from "@magnis/host/utils";
import { BaseEntityCard } from "@magnis/host/base";
import { ActionPrefix } from "@magnis/host/base";
import { ExpansionContext } from "@magnis/host/agent";
import { sourceLabel } from "./helpers";

/**
 * SINGLE canonical file card. Per `docs/frontend/module-standard.md`
 * ("ONE COMPONENT PER ENTITY"): reads `expanded` from `ExpansionContext`
 * and switches between compact (name + size/source) and expanded
 * (inline media preview + meta rows + download link).
 */

function str(data: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = data[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Chevron shows when file has preview-able content or extra meta to reveal. */
// eslint-disable-next-line react-refresh/only-export-components
export function fileHasMore(data: Readonly<Record<string, unknown>>): boolean {
  return (
    str(data, "preview_url") !== undefined ||
    str(data, "url") !== undefined ||
    str(data, "description") !== undefined ||
    str(data, "created_at") !== undefined
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-20 shrink-0 text-content-tertiary">{label}</span>
      <span className="min-w-0 flex-1 break-words text-content">{value}</span>
    </div>
  );
}

export function FileCard(props: EntityRendererProps): JSX.Element {
  const { data, action } = props;
  const name = (data.name as string | undefined) ?? "Unnamed file";
  const mimeType = (data.mime_type as string | undefined) ?? "application/octet-stream";
  const sizeBytes = data.size_bytes as number | undefined;
  const sourceModule = (data.source_module as string | undefined) ?? "";
  const { expanded } = useContext(ExpansionContext);

  const previewUrl = str(data, "preview_url");
  const url = str(data, "url");
  const description = str(data, "description");
  const createdAt = str(data, "created_at");

  const isImage = mimeType.startsWith("image/");
  const isAudio = mimeType.startsWith("audio/");
  const isVideo = mimeType.startsWith("video/");
  const mediaSrc = previewUrl ?? url;

  const rows: { label: string; value: string }[] = [];
  if (mimeType) rows.push({ label: "Type", value: mimeType });
  if (sizeBytes != null) rows.push({ label: "Size", value: formatFileSize(sizeBytes) });
  if (createdAt) rows.push({ label: "Created", value: createdAt });
  if (description) rows.push({ label: "Notes", value: description });

  const hasMedia = mediaSrc !== undefined && (isImage || isAudio || isVideo);
  const hasExpandedBody = hasMedia || rows.length > 0 || url !== undefined;

  return (
    <BaseEntityCard {...props}>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-content">
          <ActionPrefix action={action} />
          {name}
        </span>
        {!expanded && (
          <span className="block truncate text-[11px] text-content-tertiary">
            {sizeBytes != null ? formatFileSize(sizeBytes) : mimeType}
            {sourceModule ? ` · ${sourceLabel(sourceModule)}` : ""}
          </span>
        )}
        {expanded && hasExpandedBody && (
          <div className="mt-1 flex flex-col gap-2">
            {hasMedia && isImage && (
              <img
                src={mediaSrc}
                alt={name}
                className="max-h-64 w-auto rounded border border-edge object-contain"
              />
            )}
            {hasMedia && isAudio && <audio controls src={mediaSrc} className="w-full" />}
            {hasMedia && isVideo && <video controls src={mediaSrc} className="max-h-64 w-full" />}
            {rows.map((r) => (
              <Row key={r.label} label={r.label} value={r.value} />
            ))}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="text-[11px] text-accent hover:underline"
              >
                Download
              </a>
            )}
          </div>
        )}
      </div>
    </BaseEntityCard>
  );
}
