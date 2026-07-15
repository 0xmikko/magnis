import type { JSX } from "react";
import { Icon, Stack, Text } from "@magnis/host/ui";
import type { NoteListItem } from "./types";
import { extractPreview } from "./helpers";

export interface NoteListItemContentProps {
  readonly note: NoteListItem;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 86_400_000) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (diff < 7 * 86_400_000) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NoteListItemContent({ note }: NoteListItemContentProps): JSX.Element {
  const preview = note.preview ?? extractPreview(note.title, 60);
  const dateStr = formatDate(note.updated_at ?? note.created_at);

  return (
    <Stack gap={0.5} flex1>
      <div className="flex items-center gap-1.5">
        <Text variant="title" truncate className="flex-1 min-w-0">
          {note.title}
        </Text>
        {note.pinned && (
          <Icon name="pin" size={12} className="text-accent shrink-0" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Text variant="caption" truncate className="flex-1 min-w-0">
          {preview}
        </Text>
        <Text variant="caption" noShrink>
          {dateStr}
        </Text>
      </div>
    </Stack>
  );
}
