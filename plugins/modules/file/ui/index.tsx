import type { JSX } from "react";
import { Icon, Stack, Text } from "@magnis/host/ui";
import { uploadFile } from "@magnis/host/runtime";
import { formatTimeAgo, mimeToIcon } from "@magnis/host/utils";
import { defineModule } from "@magnis/host/base";
import type { ListItemContentProps } from "@magnis/host/base";
import { FileCard, fileHasMore } from "./EntityCards";
import { FileDetailPanel } from "./FileDetailPanel";
import { mimeToColor, sourceLabel } from "./helpers";

function FileListItemContent({ item }: ListItemContentProps): JSX.Element {
  const mimeType = (item.metadata?.mime_type as string | undefined) ?? "";
  const iconName = mimeToIcon(mimeType);
  const colorClass = mimeToColor(mimeType);

  return (
    <>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${colorClass}`}>
        <Icon name={iconName} size={14} />
      </span>
      <Stack gap={0.5} flex1>
        <Text variant="title" truncate className="list-item-title">
          {item.name ?? "Unnamed file"}
        </Text>
        {item.preview && (
          <Text variant="caption" truncate className="list-item-secondary">
            {item.preview}
          </Text>
        )}
      </Stack>
      {item.timestamp && (
        <Text variant="caption" className="text-content-tertiary whitespace-nowrap shrink-0">
          {formatTimeAgo(item.timestamp)}
        </Text>
      )}
    </>
  );
}

export const FilesModule = defineModule({
  id: "file",
  title: "Files",
  icon: <Icon name="folder" size={26} />,
  iconName: "folder",
  themeColor: "blue",
  entityTypes: ["object"],
  primaryEntityType: "object",
  schemas: ["file.object"], // backend uses "file.object", not "files.object"
  entityLabels: { object: { label: "File", tabLabel: "Files" } },
  rpc: { list: "file.list", get: "file.get" },
  rpcListParams: { source_module: "uploads" },
  EntityCard: FileCard,
  hasMore: fileHasMore,
  DetailPanel: FileDetailPanel,
  detailType: "custom",
  headerActionIcon: "plus",
  onHeaderAction: (runtime, onCreated) => {
    void (async (): Promise<void> => {
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
    id: (raw.entity_id as string | undefined) ?? (raw.id as string),
    name: (raw.name as string | undefined) ?? null,
    schema_id: "file.object",
    preview: [
      raw.mime_type as string | undefined,
      raw.source_module ? sourceLabel(raw.source_module as string) : null,
    ].filter(Boolean).join(" · ") || null,
    timestamp: (raw.created_at as string | undefined) ?? null,
    metadata: { mime_type: raw.mime_type ?? "" },
  }),
});
