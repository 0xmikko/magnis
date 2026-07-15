import type { MeetingsModuleData } from "./types";
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { MeetingsModule as MeetingsModuleComponent } from "./MeetingsModule";
import { MeetingCard, meetingHasMore } from "./EntityCards";
import { setupEventInvalidation } from "@magnis/host/runtime";

// eslint-disable-next-line react-refresh/only-export-components
export const MEETINGS_BASE_DATA: Omit<
  MeetingsModuleData,
  "meetings" | "rawMeetings" | "detailById" | "dateTitles" | "dayEvents" | "weekData" | "monthEvents"
> = {
  listTitle: "Meetings",
  searchPlaceholder: "Search meetings...",
  sidebarTitle: "Context",
  viewTabs: [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
  ],
  timeLabels: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"],
  header: { initials: "ME", name: "Meetings", statusText: "Calendar", color: "blue" },
  sidebar: { panelTitle: "Context", sections: [] },
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const MONTH_ABBR_UPPER = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

export const DAY_NAMES_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export const DAY_NAMES_SHORT = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
] as const;

// Meetings has a fully custom UI (calendar/agenda) — we use defineModule for
// consistency but the Component override means BaseModuleComponent is not used.
// The custom MeetingsModuleComponent manages its own list, detail, and layout.
const meetingsModuleDef = defineModule({
  id: "meetings",
  title: "Meetings",
  icon: <Icon name="calendar" size={26} />,
  iconName: "calendar",
  themeColor: "orange",
  entityTypes: ["calendar_event"],
  primaryEntityType: "calendar_event",
  entityLabels: { calendar_event: { icon: "calendar", label: "Meeting" } },
  EntityCard: MeetingCard,
  hasMore: meetingHasMore,
  extraSetup: (runtime) => {
    const unsub = setupEventInvalidation(
      runtime.transport,
      runtime.queryClient,
      ["sync.progress", "source.account.connected"],
      [["meetings"]],
    );
    return unsub;
  },
});

// Override the Component — meetings has a completely custom UI
// eslint-disable-next-line react-refresh/only-export-components
export const MeetingsModule = {
  ...meetingsModuleDef,
  Component: MeetingsModuleComponent,
};
