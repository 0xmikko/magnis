import type { JSX } from "react";
import {
  Avatar,
  Stack,
  Text,
} from "@magnis/host/ui";
import type { MeetingItem } from "./types";

export interface MeetingListItemContentProps {
  readonly meeting: MeetingItem;
}

export function MeetingListItemContent({ meeting }: MeetingListItemContentProps): JSX.Element {
  return (
    <>
      <Avatar label={meeting.initials} color={meeting.color} size="md" />
      <Stack gap={0.5} flex1>
        <Text variant="title" truncate className="list-item-title">{meeting.title}</Text>
        <Text variant="caption" truncate className="list-item-secondary">{meeting.time}</Text>
      </Stack>
    </>
  );
}
