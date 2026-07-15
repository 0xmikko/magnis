import type { JSX } from "react";
import { Row, ViewTabs, NavArrows } from "@magnis/host/ui";
import {
  useMeetingsView,
  setMeetingsView,
  nudgeDate,
  getDateLabel,
  type MeetingsView,
} from "./meetingsViewStore";
import type { MeetingsModuleData } from "./types";

interface MeetingsDetailHeaderProps {
  readonly data: MeetingsModuleData;
}

/** @deprecated No longer used — ViewTabs moved to left pane footer. */
export function MeetingsDetailHeader({ data }: MeetingsDetailHeaderProps): JSX.Element {
  const { view, dateOffset } = useMeetingsView();

  return (
    <Row align="center" justify="between" className="h-full w-full">
      <NavArrows
        label={getDateLabel(view, dateOffset)}
        onPrev={() => { nudgeDate(-1); }}
        onNext={() => { nudgeDate(1); }}
      />
      <ViewTabs
        tabs={data.viewTabs}
        activeTab={view}
        onTabChange={(id) => { setMeetingsView(id as MeetingsView); }}
      />
    </Row>
  );
}
