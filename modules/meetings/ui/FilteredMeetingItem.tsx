import type { JSX } from "react";
import { ModuleListItem } from "@magnis/host/ui";
import { MeetingListItemContent } from "./MeetingListItemContent";
import { useMeetingsView, getDateRange } from "./meetingsViewStore";
import type { MeetingItem } from "./types";

interface FilteredMeetingItemProps {
  readonly meeting: MeetingItem;
  readonly isSelected: boolean;
}

/** @deprecated No longer used — replaced by AgendaList in MeetingsModule. */
export function FilteredMeetingItem({
  meeting,
  isSelected,
}: FilteredMeetingItemProps): JSX.Element | null {
  const { view, dateOffset } = useMeetingsView();

  if (!meeting.starts_at) return null;
  const { start, end } = getDateRange(view, dateOffset);
  const d = new Date(meeting.starts_at);
  if (d < start || d >= end) return null;

  return (
    <ModuleListItem selected={isSelected}>
      <MeetingListItemContent meeting={meeting} />
    </ModuleListItem>
  );
}
