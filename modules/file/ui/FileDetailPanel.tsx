import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@magnis/host/ui";
import { DetailPane } from "@magnis/host/layout";
import { useAppRuntime, authHeaders } from "@magnis/host/runtime";
import { formatFileSize, mimeToIcon } from "@magnis/host/utils";
import type { DetailPanelProps } from "@magnis/host/base";
import { mimeToColor, sourceLabel } from "./helpers";

interface FileData {
  readonly entity_id: string;
  readonly name: string | null;
  readonly mime_type: string;
  readonly size_bytes: number | null;
  readonly source_module: string;
  readonly url: string | null;
}

/** Safe MIME types we render inline. SVG excluded (XSS vector). */
function previewKind(mime: string): "image" | "video" | "audio" | "pdf" | null {
  if (mime === "image/svg+xml") return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return null;
}

function fileMetaLine(file: FileData | undefined, mime: string): string {
  const parts = [
    mime || null,
    file?.size_bytes !== undefined && file.size_bytes !== null ? formatFileSize(file.size_bytes) : null,
    file?.source_module ? sourceLabel(file.source_module) : null,
  ].filter((part): part is string => part !== null && part.length > 0);

  return parts.join(" / ");
}

type FileStatus = "checking" | "ready" | "downloading" | "unavailable";
type PreviewStatus = "idle" | "loading" | "ready" | "unavailable";

/**
 * Poll file endpoint until it returns 200.
 * Backend returns 202 when file is not on disk yet (enqueues download).
 */
function useFileStatus(fileUrl: string, kind: string | null, entityId: string): FileStatus {
  const [status, setStatus] = useState<FileStatus>("checking");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const attemptRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset polling state to "checking" whenever the file inputs change; the async poll below drives subsequent transitions.
    setStatus("checking");
    attemptRef.current = 0;

    if (!kind) {
      // No preview needed — skip polling
      setStatus("ready");
      return;
    }

    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(fileUrl, {
          method: "HEAD",
          headers: authHeaders(),
          credentials: "include",
        });
        if (cancelled) return;

        if (res.status === 200) {
          setStatus("ready");
          return;
        }
        if (res.status === 202) {
          attemptRef.current += 1;
          // Give up after 5 attempts (~30s total)
          if (attemptRef.current >= 5) {
            setStatus("unavailable");
            return;
          }
          setStatus("downloading");
          const delay = Math.min(2000 * attemptRef.current, 10_000);
          timerRef.current = setTimeout(() => { if (!cancelled) void poll(); }, delay);
          return;
        }
        // Other error — give up
        setStatus("unavailable");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }

    void poll();

    return (): void => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fileUrl, kind, entityId]);

  return status;
}

function useAuthenticatedPreviewUrl(
  fileUrl: string,
  kind: string | null,
  fileStatus: FileStatus,
  entityId: string,
): { readonly previewUrl: string | null; readonly previewStatus: PreviewStatus } {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");

  useEffect(() => {
    if (!kind || fileStatus !== "ready") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear/revoke the preview object URL when the file is not ready; keyed by kind/fileStatus.
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewStatus(fileStatus === "unavailable" ? "unavailable" : "idle");
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setPreviewStatus("loading");

    void (async (): Promise<void> => {
      try {
        const res = await fetch(fileUrl, {
          method: "GET",
          headers: authHeaders(),
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) {
          setPreviewStatus("unavailable");
          return;
        }

        const blob = await res.blob();
        if (controller.signal.aborted) return;
        const nextUrl = URL.createObjectURL(blob);
        objectUrl = nextUrl;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
        setPreviewStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPreviewStatus("unavailable");
      }
    })();

    return (): void => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, kind, fileStatus, entityId]);

  return { previewUrl, previewStatus };
}

export function FileDetailPanel({ entityId }: DetailPanelProps): JSX.Element {
  const runtime = useAppRuntime();

  const { data: file } = useQuery({
    queryKey: ["file", "detail", entityId],
    queryFn: () => runtime.transport.rpc<FileData>("file.get", { id: entityId }),
    enabled: !!entityId,
    staleTime: 15_000,
  });

  const fileUrl = `${runtime.transport.baseUrl}/files/${entityId}`;
  const mime = file?.mime_type ?? "";
  const kind = previewKind(mime);
  const iconName = mimeToIcon(mime);
  const colorClass = mimeToColor(mime);
  const metaLine = fileMetaLine(file, mime);
  const hasInlinePreview = kind !== null;

  const fileStatus = useFileStatus(fileUrl, kind, entityId);
  const { previewUrl, previewStatus } = useAuthenticatedPreviewUrl(fileUrl, kind, fileStatus, entityId);

  return (
    <DetailPane
      headerNode={
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${colorClass}`}>
            <Icon name={iconName} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-medium text-content truncate">
              {file?.name ?? "Loading..."}
            </div>
            <div className="text-sm text-content-tertiary truncate">{metaLine}</div>
          </div>
        </div>
      }
      footer={!hasInlinePreview ? (
        <div className="px-6 py-4 border-t border-edge space-y-2 text-sm">
          {file?.size_bytes !== undefined && file.size_bytes !== null && (
            <div className="flex justify-between">
              <span className="text-content-secondary">Size</span>
              <span className="text-content">{formatFileSize(file.size_bytes)}</span>
            </div>
          )}
          {file?.source_module && (
            <div className="flex justify-between">
              <span className="text-content-secondary">Source</span>
              <span className="text-content">{sourceLabel(file.source_module)}</span>
            </div>
          )}
        </div>
      ) : undefined}
      contentClassName="flex min-h-0 overflow-hidden"
      scrollY={false}
    >
      <div className="flex h-full min-h-0 flex-1 overflow-hidden" data-testid="file-preview">
        {fileStatus === "checking" || fileStatus === "downloading" || (fileStatus === "ready" && kind !== null && previewStatus === "loading") ? (
          <div className="flex h-full w-full items-center justify-center text-content-tertiary text-sm">
            Downloading file...
          </div>
        ) : fileStatus === "ready" && previewStatus === "ready" && kind === "image" && previewUrl ? (
          <div className="flex h-full min-h-0 w-full items-center justify-center overflow-auto p-6">
            <img
              src={previewUrl}
              alt={file?.name ?? ""}
              loading="lazy"
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        ) : fileStatus === "ready" && previewStatus === "ready" && kind === "video" && previewUrl ? (
          <div className="flex h-full min-h-0 w-full items-center justify-center overflow-auto p-6">
            <video
              src={previewUrl}
              controls
              preload="metadata"
              className="max-h-full max-w-full rounded-lg"
            />
          </div>
        ) : fileStatus === "ready" && previewStatus === "ready" && kind === "audio" && previewUrl ? (
          <div className="flex h-full min-h-0 w-full items-center justify-center p-6">
            <audio
              src={previewUrl}
              controls
              preload="metadata"
              className="w-full max-w-md"
            />
          </div>
        ) : fileStatus === "ready" && previewStatus === "ready" && kind === "pdf" && previewUrl ? (
          <embed
            src={previewUrl}
            type="application/pdf"
            className="h-full min-h-0 w-full"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-content-tertiary">
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-xl text-white ${colorClass}`}
              data-testid="file-icon-fallback"
            >
              <Icon name={iconName} size={32} />
            </span>
            <span className="text-sm">
              {fileStatus === "unavailable" ? "File not available" : "No preview available"}
            </span>
          </div>
        )}
      </div>
    </DetailPane>
  );
}
