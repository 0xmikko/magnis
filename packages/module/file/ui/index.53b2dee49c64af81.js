// plugins/modules/file/ui/index.tsx
import { Icon as Icon2, Stack, Text } from "/api/plugins/__host-shim.js?m=ui";
import { uploadFile } from "/api/plugins/__host-shim.js?m=runtime";
import { formatTimeAgo, mimeToIcon as mimeToIcon2 } from "/api/plugins/__host-shim.js?m=utils";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/file/ui/EntityCards.tsx
import { useContext } from "/api/plugins/__host-shim.js?m=react";
import { formatFileSize } from "/api/plugins/__host-shim.js?m=utils";
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";

// plugins/modules/file/ui/helpers.ts
function mimeToColor(mimeType) {
  if (mimeType.startsWith("image/"))
    return "bg-pink-600";
  if (mimeType.startsWith("video/"))
    return "bg-purple-600";
  if (mimeType.startsWith("audio/"))
    return "bg-amber-600";
  if (mimeType === "application/pdf")
    return "bg-red-600";
  return "bg-blue-600";
}
function sourceLabel(sourceModule) {
  switch (sourceModule) {
    case "telegram":
      return "Telegram";
    case "email":
      return "Email";
    case "uploads":
      return "Upload";
    case "upload":
      return "Upload";
    default:
      return sourceModule;
  }
}

// plugins/modules/file/ui/EntityCards.tsx
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function str(data, key) {
  const v = data[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function fileHasMore(data) {
  return str(data, "preview_url") !== undefined || str(data, "url") !== undefined || str(data, "description") !== undefined || str(data, "created_at") !== undefined;
}
function Row({ label, value }) {
  return /* @__PURE__ */ jsxs("div", {
    className: "flex gap-2 text-[11px]",
    children: [
      /* @__PURE__ */ jsx("span", {
        className: "w-20 shrink-0 text-content-tertiary",
        children: label
      }),
      /* @__PURE__ */ jsx("span", {
        className: "min-w-0 flex-1 break-words text-content",
        children: value
      })
    ]
  });
}
function FileCard(props) {
  const { data, action } = props;
  const name = data.name ?? "Unnamed file";
  const mimeType = data.mime_type ?? "application/octet-stream";
  const sizeBytes = data.size_bytes;
  const sourceModule = data.source_module ?? "";
  const { expanded } = useContext(ExpansionContext);
  const previewUrl = str(data, "preview_url");
  const url = str(data, "url");
  const description = str(data, "description");
  const createdAt = str(data, "created_at");
  const isImage = mimeType.startsWith("image/");
  const isAudio = mimeType.startsWith("audio/");
  const isVideo = mimeType.startsWith("video/");
  const mediaSrc = previewUrl ?? url;
  const rows = [];
  if (mimeType)
    rows.push({ label: "Type", value: mimeType });
  if (sizeBytes !== undefined)
    rows.push({ label: "Size", value: formatFileSize(sizeBytes) });
  if (createdAt)
    rows.push({ label: "Created", value: createdAt });
  if (description)
    rows.push({ label: "Notes", value: description });
  const hasMedia = mediaSrc !== undefined && (isImage || isAudio || isVideo);
  const hasExpandedBody = hasMedia || rows.length > 0 || url !== undefined;
  return /* @__PURE__ */ jsx(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs("span", {
          className: "block truncate text-[12px] font-medium text-content",
          children: [
            /* @__PURE__ */ jsx(ActionPrefix, {
              action
            }),
            name
          ]
        }),
        !expanded && /* @__PURE__ */ jsxs("span", {
          className: "block truncate text-[11px] text-content-tertiary",
          children: [
            sizeBytes !== undefined ? formatFileSize(sizeBytes) : mimeType,
            sourceModule ? ` · ${sourceLabel(sourceModule)}` : ""
          ]
        }),
        expanded && hasExpandedBody && /* @__PURE__ */ jsxs("div", {
          className: "mt-1 flex flex-col gap-2",
          children: [
            hasMedia && isImage && /* @__PURE__ */ jsx("img", {
              src: mediaSrc,
              alt: name,
              className: "max-h-64 w-auto rounded border border-edge object-contain"
            }),
            hasMedia && isAudio && /* @__PURE__ */ jsx("audio", {
              controls: true,
              src: mediaSrc,
              className: "w-full"
            }),
            hasMedia && isVideo && /* @__PURE__ */ jsx("video", {
              controls: true,
              src: mediaSrc,
              className: "max-h-64 w-full"
            }),
            rows.map((r) => /* @__PURE__ */ jsx(Row, {
              label: r.label,
              value: r.value
            }, r.label)),
            url && /* @__PURE__ */ jsx("a", {
              href: url,
              target: "_blank",
              rel: "noopener noreferrer",
              onClick: (e) => {
                e.stopPropagation();
              },
              className: "text-[11px] text-accent hover:underline",
              children: "Download"
            })
          ]
        })
      ]
    })
  });
}

// plugins/modules/file/ui/FileDetailPanel.tsx
import { useEffect, useRef, useState } from "/api/plugins/__host-shim.js?m=react";
import { useQuery } from "/api/plugins/__host-shim.js?m=react-query";
import { Icon } from "/api/plugins/__host-shim.js?m=ui";
import { DetailPane } from "/api/plugins/__host-shim.js?m=layout";
import { useAppRuntime, authHeaders } from "/api/plugins/__host-shim.js?m=runtime";
import { formatFileSize as formatFileSize2, mimeToIcon } from "/api/plugins/__host-shim.js?m=utils";
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function previewKind(mime) {
  if (mime === "image/svg+xml")
    return null;
  if (mime.startsWith("image/"))
    return "image";
  if (mime.startsWith("video/"))
    return "video";
  if (mime.startsWith("audio/"))
    return "audio";
  if (mime === "application/pdf")
    return "pdf";
  return null;
}
function fileMetaLine(file, mime) {
  const parts = [
    mime || null,
    file?.size_bytes !== undefined && file.size_bytes !== null ? formatFileSize2(file.size_bytes) : null,
    file?.source_module ? sourceLabel(file.source_module) : null
  ].filter((part) => part !== null && part.length > 0);
  return parts.join(" / ");
}
function useFileStatus(fileUrl, kind, entityId) {
  const [status, setStatus] = useState("checking");
  const timerRef = useRef();
  const attemptRef = useRef(0);
  useEffect(() => {
    setStatus("checking");
    attemptRef.current = 0;
    if (!kind) {
      setStatus("ready");
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(fileUrl, {
          method: "HEAD",
          headers: authHeaders(),
          credentials: "include"
        });
        if (cancelled)
          return;
        if (res.status === 200) {
          setStatus("ready");
          return;
        }
        if (res.status === 202) {
          attemptRef.current += 1;
          if (attemptRef.current >= 5) {
            setStatus("unavailable");
            return;
          }
          setStatus("downloading");
          const delay = Math.min(2000 * attemptRef.current, 1e4);
          timerRef.current = setTimeout(() => {
            if (!cancelled)
              poll();
          }, delay);
          return;
        }
        setStatus("unavailable");
      } catch {
        if (!cancelled)
          setStatus("unavailable");
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timerRef.current)
        clearTimeout(timerRef.current);
    };
  }, [fileUrl, kind, entityId]);
  return status;
}
function useAuthenticatedPreviewUrl(fileUrl, kind, fileStatus, entityId) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewStatus, setPreviewStatus] = useState("idle");
  useEffect(() => {
    if (!kind || fileStatus !== "ready") {
      setPreviewUrl((prev) => {
        if (prev)
          URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewStatus(fileStatus === "unavailable" ? "unavailable" : "idle");
      return;
    }
    const controller = new AbortController;
    let objectUrl = null;
    setPreviewStatus("loading");
    (async () => {
      try {
        const res = await fetch(fileUrl, {
          method: "GET",
          headers: authHeaders(),
          credentials: "include",
          signal: controller.signal
        });
        if (!res.ok) {
          setPreviewStatus("unavailable");
          return;
        }
        const blob = await res.blob();
        if (controller.signal.aborted)
          return;
        const nextUrl = URL.createObjectURL(blob);
        objectUrl = nextUrl;
        setPreviewUrl((prev) => {
          if (prev)
            URL.revokeObjectURL(prev);
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
    return () => {
      controller.abort();
      if (objectUrl)
        URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, kind, fileStatus, entityId]);
  return { previewUrl, previewStatus };
}
function FileDetailPanel({ entityId }) {
  const runtime = useAppRuntime();
  const { data: file } = useQuery({
    queryKey: ["file", "detail", entityId],
    queryFn: () => runtime.transport.rpc("file.get", { id: entityId }),
    enabled: !!entityId,
    staleTime: 15000
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
  return /* @__PURE__ */ jsx2(DetailPane, {
    headerNode: /* @__PURE__ */ jsxs2("div", {
      className: "flex items-center gap-3",
      children: [
        /* @__PURE__ */ jsx2("span", {
          className: `flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${colorClass}`,
          children: /* @__PURE__ */ jsx2(Icon, {
            name: iconName,
            size: 20
          })
        }),
        /* @__PURE__ */ jsxs2("div", {
          className: "min-w-0 flex-1",
          children: [
            /* @__PURE__ */ jsx2("div", {
              className: "text-base font-medium text-content truncate",
              children: file?.name ?? "Loading..."
            }),
            /* @__PURE__ */ jsx2("div", {
              className: "text-sm text-content-tertiary truncate",
              children: metaLine
            })
          ]
        })
      ]
    }),
    footer: !hasInlinePreview ? /* @__PURE__ */ jsxs2("div", {
      className: "px-6 py-4 border-t border-edge space-y-2 text-sm",
      children: [
        file?.size_bytes !== undefined && file.size_bytes !== null && /* @__PURE__ */ jsxs2("div", {
          className: "flex justify-between",
          children: [
            /* @__PURE__ */ jsx2("span", {
              className: "text-content-secondary",
              children: "Size"
            }),
            /* @__PURE__ */ jsx2("span", {
              className: "text-content",
              children: formatFileSize2(file.size_bytes)
            })
          ]
        }),
        file?.source_module && /* @__PURE__ */ jsxs2("div", {
          className: "flex justify-between",
          children: [
            /* @__PURE__ */ jsx2("span", {
              className: "text-content-secondary",
              children: "Source"
            }),
            /* @__PURE__ */ jsx2("span", {
              className: "text-content",
              children: sourceLabel(file.source_module)
            })
          ]
        })
      ]
    }) : undefined,
    contentClassName: "flex min-h-0 overflow-hidden",
    scrollY: false,
    children: /* @__PURE__ */ jsx2("div", {
      className: "flex h-full min-h-0 flex-1 overflow-hidden",
      "data-testid": "file-preview",
      children: fileStatus === "checking" || fileStatus === "downloading" || fileStatus === "ready" && kind !== null && previewStatus === "loading" ? /* @__PURE__ */ jsx2("div", {
        className: "flex h-full w-full items-center justify-center text-content-tertiary text-sm",
        children: "Downloading file..."
      }) : fileStatus === "ready" && previewStatus === "ready" && kind === "image" && previewUrl ? /* @__PURE__ */ jsx2("div", {
        className: "flex h-full min-h-0 w-full items-center justify-center overflow-auto p-6",
        children: /* @__PURE__ */ jsx2("img", {
          src: previewUrl,
          alt: file?.name ?? "",
          loading: "lazy",
          className: "max-h-full max-w-full rounded-lg object-contain"
        })
      }) : fileStatus === "ready" && previewStatus === "ready" && kind === "video" && previewUrl ? /* @__PURE__ */ jsx2("div", {
        className: "flex h-full min-h-0 w-full items-center justify-center overflow-auto p-6",
        children: /* @__PURE__ */ jsx2("video", {
          src: previewUrl,
          controls: true,
          preload: "metadata",
          className: "max-h-full max-w-full rounded-lg"
        })
      }) : fileStatus === "ready" && previewStatus === "ready" && kind === "audio" && previewUrl ? /* @__PURE__ */ jsx2("div", {
        className: "flex h-full min-h-0 w-full items-center justify-center p-6",
        children: /* @__PURE__ */ jsx2("audio", {
          src: previewUrl,
          controls: true,
          preload: "metadata",
          className: "w-full max-w-md"
        })
      }) : fileStatus === "ready" && previewStatus === "ready" && kind === "pdf" && previewUrl ? /* @__PURE__ */ jsx2("embed", {
        src: previewUrl,
        type: "application/pdf",
        className: "h-full min-h-0 w-full"
      }) : /* @__PURE__ */ jsxs2("div", {
        className: "flex h-full w-full flex-col items-center justify-center gap-3 text-content-tertiary",
        children: [
          /* @__PURE__ */ jsx2("span", {
            className: `flex h-16 w-16 items-center justify-center rounded-xl text-white ${colorClass}`,
            "data-testid": "file-icon-fallback",
            children: /* @__PURE__ */ jsx2(Icon, {
              name: iconName,
              size: 32
            })
          }),
          /* @__PURE__ */ jsx2("span", {
            className: "text-sm",
            children: fileStatus === "unavailable" ? "File not available" : "No preview available"
          })
        ]
      })
    })
  });
}

// plugins/modules/file/ui/index.tsx
import { jsx as jsx3, jsxs as jsxs3, Fragment } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function FileListItemContent({ item }) {
  const mimeType = item.metadata?.mime_type ?? "";
  const iconName = mimeToIcon2(mimeType);
  const colorClass = mimeToColor(mimeType);
  return /* @__PURE__ */ jsxs3(Fragment, {
    children: [
      /* @__PURE__ */ jsx3("span", {
        className: `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${colorClass}`,
        children: /* @__PURE__ */ jsx3(Icon2, {
          name: iconName,
          size: 14
        })
      }),
      /* @__PURE__ */ jsxs3(Stack, {
        gap: 0.5,
        flex1: true,
        children: [
          /* @__PURE__ */ jsx3(Text, {
            variant: "title",
            truncate: true,
            className: "list-item-title",
            children: item.name ?? "Unnamed file"
          }),
          item.preview && /* @__PURE__ */ jsx3(Text, {
            variant: "caption",
            truncate: true,
            className: "list-item-secondary",
            children: item.preview
          })
        ]
      }),
      item.timestamp && /* @__PURE__ */ jsx3(Text, {
        variant: "caption",
        className: "text-content-tertiary whitespace-nowrap shrink-0",
        children: formatTimeAgo(item.timestamp)
      })
    ]
  });
}
var FilesModule = defineModule({
  id: "file",
  title: "Files",
  icon: /* @__PURE__ */ jsx3(Icon2, {
    name: "folder",
    size: 26
  }),
  iconName: "folder",
  themeColor: "blue",
  entityTypes: ["object"],
  primaryEntityType: "object",
  schemas: ["file.object"],
  entityLabels: { object: { label: "File", tabLabel: "Files" } },
  rpc: { list: "file.list", get: "file.get" },
  rpcListParams: { source_module: "uploads" },
  EntityCard: FileCard,
  hasMore: fileHasMore,
  DetailPanel: FileDetailPanel,
  detailType: "custom",
  headerActionIcon: "plus",
  onHeaderAction: (runtime, onCreated) => {
    (async () => {
      const result = await uploadFile(runtime.transport);
      if (result) {
        onCreated(result.id);
      }
    })();
  },
  ListItemContent: FileListItemContent,
  groupBy: "date",
  getGroupDate: (item) => item.timestamp ? new Date(item.timestamp) : null,
  mapListItem: (raw) => ({
    id: raw.entity_id ?? raw.id,
    name: raw.name ?? null,
    schema_id: "file.object",
    preview: [
      raw.mime_type,
      raw.source_module ? sourceLabel(raw.source_module) : null
    ].filter(Boolean).join(" · ") || null,
    timestamp: raw.created_at ?? null,
    metadata: { mime_type: raw.mime_type ?? "" }
  })
});
export {
  FilesModule
};
