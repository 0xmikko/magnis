import type {
  CalendarAttendee,
  MeetingAttendee,
  MeetingCalendarEvent,
  MeetingDetailData,
  MeetingItem,
  MeetingListItem,
  MeetingMonthEvent,
  MeetingWeekDay,
} from "./types";
import { pickAvatarColor, initialsFromName } from "@magnis/host/utils";
import {
  DAY_NAMES_LONG,
  DAY_NAMES_SHORT,
  MONTH_ABBR_UPPER,
  MONTH_NAMES,
} from "./index";

/**
 * Display string for one canonical `CalendarAttendee`: prefer `name`,
 * fall back to `email` so a name-less attendee still has something to show.
 */
export function attendeeDisplay(a: CalendarAttendee): string {
  return a.name ?? a.email;
}

export function mapMeetingFromApi(m: MeetingListItem): MeetingItem {
  const title = m.title?.trim() ? m.title.trim() : "Untitled meeting";
  const attendees = m.attendees.filter((a) => a.email.trim().length > 0);
  const attendeeLabels = attendees.map(attendeeDisplay);
  const withText = attendeeLabels.length > 0 ? attendeeLabels.join(", ") : "No attendees";
  const date = m.date?.trim() ? m.date : "TBD";
  const time = m.time?.trim() ? m.time : "TBD";
  const preview =
    m.location?.trim() ||
    (attendeeLabels.length > 0 ? attendeeLabels.slice(0, 2).join(", ") : "No location");

  const initialsSource = attendeeLabels[0] ?? title;

  return {
    id: m.id,
    title,
    date,
    time,
    with: withText,
    initials: initialsFromName(initialsSource) === "?" ? "ME" : initialsFromName(initialsSource),
    kind: attendeeLabels.length > 0 ? "meeting" : "person",
    preview,
    color: pickAvatarColor(m.id),
    starts_at: m.starts_at ?? undefined,
    description: undefined,
    location: m.location ?? undefined,
  };
}

export function buildDayEvents(meetings: readonly MeetingListItem[]): MeetingCalendarEvent[] {
  const today = new Date().toISOString().slice(0, 10);
  return meetings
    .filter((m) => m.starts_at?.slice(0, 10) === today)
    .map((m) => ({
      title: m.title,
      time: m.time ?? "",
      color: pickAvatarColor(m.id),
    }));
}

export function buildWeekEvents(meetings: readonly MeetingListItem[]): MeetingCalendarEvent[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  return meetings
    .filter((m) => {
      if (!m.starts_at) return false;
      const d = new Date(m.starts_at);
      return d >= monday && d < sunday;
    })
    .map((m) => {
      const d = new Date(m.starts_at!);
      const col = ((d.getDay() + 6) % 7) + 1;
      return {
        title: m.title,
        time: m.time ?? "",
        color: pickAvatarColor(m.id),
        column: col,
      };
    });
}

export function buildMonthEvents(meetings: readonly MeetingListItem[]): MeetingMonthEvent[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return meetings
    .filter((m) => {
      if (!m.starts_at) return false;
      const d = new Date(m.starts_at);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .map((m) => {
      const d = new Date(m.starts_at!);
      return {
        dayIndex: d.getDate() - 1,
        title: m.title,
        color: pickAvatarColor(m.id),
      };
    });
}

export function buildCurrentDateTitles(): {
  detail: string;
  day: string;
  month: string;
} {
  const now = new Date();
  const dayName = DAY_NAMES_LONG[now.getDay()];
  const monthName = MONTH_NAMES[now.getMonth()];
  const dateStr = `${dayName}, ${monthName} ${now.getDate()}, ${now.getFullYear()}`;
  return {
    detail: dateStr,
    day: dateStr,
    month: `${monthName} ${now.getFullYear()}`,
  };
}

export function buildCurrentWeekDays(): { dateRange: string; days: MeetingWeekDay[] } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));

  const days: MeetingWeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      day: DAY_NAMES_SHORT[d.getDay()] ?? "",
      date: String(d.getDate()),
      highlight: d.toDateString() === now.toDateString(),
    });
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const dateRange = `${MONTH_NAMES[monday.getMonth()]} ${monday.getDate()} - ${sunday.getDate()}, ${sunday.getFullYear()}`;

  return { dateRange, days };
}

export function currentMonthDayCount(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function buildDayEventsForRange(
  meetings: readonly MeetingListItem[],
  start: Date,
  end: Date,
): MeetingCalendarEvent[] {
  return meetings
    .filter((m) => {
      if (!m.starts_at) return false;
      const d = new Date(m.starts_at);
      return d >= start && d < end;
    })
    .map((m) => ({
      title: m.title,
      time: m.time ?? "",
      color: pickAvatarColor(m.id),
    }));
}

export function buildWeekEventsForRange(
  meetings: readonly MeetingListItem[],
  start: Date,
  _end: Date,
): MeetingCalendarEvent[] {
  const monday = new Date(start);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);

  return meetings
    .filter((m) => {
      if (!m.starts_at) return false;
      const d = new Date(m.starts_at);
      return d >= monday && d < sunday;
    })
    .map((m) => {
      const d = new Date(m.starts_at!);
      const col = ((d.getDay() + 6) % 7) + 1;
      return {
        title: m.title,
        time: m.time ?? "",
        color: pickAvatarColor(m.id),
        column: col,
      };
    });
}

export function buildMonthEventsForRange(
  meetings: readonly MeetingListItem[],
  start: Date,
  end: Date,
): MeetingMonthEvent[] {
  return meetings
    .filter((m) => {
      if (!m.starts_at) return false;
      const d = new Date(m.starts_at);
      return d >= start && d < end;
    })
    .map((m) => {
      const d = new Date(m.starts_at!);
      return {
        dayIndex: d.getDate() - 1,
        title: m.title,
        color: pickAvatarColor(m.id),
      };
    });
}

export function buildWeekDaysForRange(start: Date): {
  dateRange: string;
  days: MeetingWeekDay[];
} {
  const now = new Date();
  const monday = new Date(start);
  monday.setHours(0, 0, 0, 0);

  const days: MeetingWeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      day: DAY_NAMES_SHORT[d.getDay()] ?? "",
      date: String(d.getDate()),
      highlight: d.toDateString() === now.toDateString(),
    });
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mMonth = MONTH_NAMES[monday.getMonth()];
  const sMonth = MONTH_NAMES[sunday.getMonth()];
  const dateRange =
    monday.getMonth() === sunday.getMonth()
      ? `${mMonth} ${monday.getDate()} - ${sunday.getDate()}, ${sunday.getFullYear()}`
      : `${mMonth} ${monday.getDate()} - ${sMonth} ${sunday.getDate()}, ${sunday.getFullYear()}`;

  return { dateRange, days };
}

export function monthDayCountFor(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export interface AgendaMeetingGroup {
  readonly date: Date;
  readonly meetingIds: readonly string[];
}

export function buildAgendaGroups(
  meetings: readonly MeetingListItem[],
  start: Date,
  end: Date,
): AgendaMeetingGroup[] {
  const byDate = new Map<string, { date: Date; items: { id: string; startsAt: number }[] }>();

  for (const m of meetings) {
    if (!m.starts_at) continue;
    const d = new Date(m.starts_at);
    if (d < start || d >= end) continue;
    const key = d.toISOString().slice(0, 10);
    let bucket = byDate.get(key);
    if (!bucket) {
      bucket = { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      byDate.set(key, bucket);
    }
    bucket.items.push({ id: m.id, startsAt: d.getTime() });
  }

  // Sort events within each day: morning → evening
  const groups = Array.from(byDate.values()).map((bucket) => {
    bucket.items.sort((a, b) => a.startsAt - b.startsAt);
    return { date: bucket.date, meetingIds: bucket.items.map((i) => i.id) };
  });

  // Sort days: oldest first (chronological) so the nearest upcoming day sits at
  // the top of the agenda viewport and future events flow downward; past days
  // are above (scroll up). The initial scroll anchors to the first upcoming day.
  return groups.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getMeeting(
  meetings: readonly MeetingItem[],
  id: string,
): MeetingItem | undefined {
  if (meetings.length === 0) return undefined;
  const meetingsMap = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  return meetingsMap.get(id) ?? meetings[0];
}

export function buildMeetingDetail(m: MeetingListItem): MeetingDetailData {
  const startsAt = m.starts_at ? new Date(m.starts_at) : null;
  const endsAt = m.ends_at ? new Date(m.ends_at) : null;

  const dateDay = startsAt ? String(startsAt.getDate()) : "";
  const dateMonth = startsAt ? (MONTH_ABBR_UPPER[startsAt.getMonth()] ?? "") : "";

  let subtitle = m.time ?? "";
  if (startsAt && endsAt) {
    const durationMs = endsAt.getTime() - startsAt.getTime();
    const durationMins = Math.round(durationMs / 60000);
    if (durationMins >= 60) {
      const hours = Math.floor(durationMins / 60);
      const mins = durationMins % 60;
      subtitle += ` (${hours}h${mins > 0 ? ` ${mins}m` : ""})`;
    } else if (durationMins > 0) {
      subtitle += ` (${durationMins}m)`;
    }
  }

  const rawAttendees = m.attendees.filter((a) => a.email.trim().length > 0);
  const attendees: MeetingAttendee[] = rawAttendees.map((a, i) => {
    const displayName = a.name ?? a.email;
    return {
      initials: initialsFromName(displayName) === "?" ? "ME" : initialsFromName(displayName),
      name: displayName,
      email: a.email,
      role: i === 0 ? "Organizer" : "Required",
      color: pickAvatarColor(a.email),
      contactId: a.contact_id ?? undefined,
    };
  });

  return {
    dateDay,
    dateMonth,
    subtitle,
    location: m.location ?? "",
    description: m.description ?? "",
    conferenceLink: m.conference_link ?? "",
    attendees,
    // No stub actions. Real management actions (RSVP, reschedule,
    // cancel, join-with-meet) need either a write-back path into the
    // calendar source (not wired) or a conference_link field on the
    // meeting entity (not surfaced by the mock /inject-event). Don't
    // render dead buttons — add them back as real affordances when
    // their data dependency lands.
    actions: [],
  };
}
