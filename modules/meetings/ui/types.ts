import type { AvatarColor, SidebarData } from "@magnis/host/base";
import type { MeetingListItem } from "../types.ts";

export type { MeetingAttendeeView, MeetingDetailView, MeetingListItem } from "../types.ts";

export interface MeetingItem {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly time: string;
  readonly with: string;
  readonly initials: string;
  readonly kind: "meeting" | "person";
  readonly preview: string;
  readonly color: AvatarColor;
  readonly starts_at?: string;
  readonly description?: string;
  readonly location?: string;
}

export interface MeetingAttendee {
  readonly initials: string;
  readonly name: string;
  readonly email?: string;
  readonly role?: string;
  readonly color: AvatarColor;
  /** Resolved contacts.person id, when this guest is a known contact.
   *  Undefined → guest not in the graph (UI renders muted + offers to
   *  create the contact on click). */
  readonly contactId?: string;
}

export interface MeetingAction {
  readonly label: string;
  readonly variant: "primary" | "default" | "danger";
  readonly icon?: string;
}

export interface MeetingDetailData {
  readonly dateDay: string;
  readonly dateMonth: string;
  readonly subtitle: string;
  readonly location: string;
  readonly description: string;
  readonly conferenceLink: string;
  readonly attendees: readonly MeetingAttendee[];
  readonly actions: readonly MeetingAction[];
}

export interface MeetingCalendarEvent {
  readonly title: string;
  readonly time: string;
  readonly color: string;
  readonly column?: number;
  readonly row?: number;
}

export interface MeetingWeekDay {
  readonly day: string;
  readonly date: string;
  readonly highlight?: boolean;
}

export interface MeetingMonthEvent {
  readonly dayIndex: number;
  readonly title: string;
  readonly color: string;
}

export interface MeetingHeaderData {
  readonly initials: string;
  readonly name: string;
  readonly statusText: string;
  readonly color: AvatarColor;
}

export interface MeetingsModuleData {
  readonly listTitle: string;
  readonly searchPlaceholder: string;
  readonly sidebarTitle: string;
  readonly viewTabs: readonly { readonly id: string; readonly label: string }[];
  readonly dateTitles: {
    readonly detail: string;
    readonly day: string;
    readonly month: string;
  };
  readonly timeLabels: readonly string[];
  readonly header: MeetingHeaderData;
  readonly meetings: readonly MeetingItem[];
  readonly rawMeetings?: readonly MeetingListItem[];
  readonly detailById: Readonly<Record<string, MeetingDetailData>>;
  readonly dayEvents: readonly MeetingCalendarEvent[];
  readonly weekData: {
    readonly dateRange: string;
    readonly days: readonly MeetingWeekDay[];
    readonly events: readonly MeetingCalendarEvent[];
  };
  readonly monthEvents: readonly MeetingMonthEvent[];
  readonly sidebar: SidebarData;
}
