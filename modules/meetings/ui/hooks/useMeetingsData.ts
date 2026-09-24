import { useMemo } from "react";
import {
  mapMeetingFromApi,
  buildCurrentDateTitles,
  buildCurrentWeekDays,
  buildDayEvents,
  buildWeekEvents,
  buildMonthEvents,
  buildMeetingDetail,
} from "../helpers";
import { MEETINGS_BASE_DATA } from "../index";
import type { MeetingDetailData, MeetingsModuleData } from "../types";
import { useMeetingsListQuery } from "../queries";

export function useMeetingsData(): MeetingsModuleData {
  const { data } = useMeetingsListQuery();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rawMeetings = data?.items ?? [];

  const meetings = useMemo(
    () => rawMeetings.map(mapMeetingFromApi),
    [rawMeetings],
  );

  const detailById = useMemo(() => {
    const details: Record<string, MeetingDetailData> = {};
    for (const meeting of rawMeetings) {
      details[meeting.id] = buildMeetingDetail(meeting);
    }
    return details;
  }, [rawMeetings]);

  const dateTitles = buildCurrentDateTitles();
  const { dateRange, days } = buildCurrentWeekDays();

  const dayEvents = useMemo(() => buildDayEvents(rawMeetings), [rawMeetings]);
  const weekEvents = useMemo(() => buildWeekEvents(rawMeetings), [rawMeetings]);
  const monthEvents = useMemo(() => buildMonthEvents(rawMeetings), [rawMeetings]);

  return {
    ...MEETINGS_BASE_DATA,
    meetings,
    rawMeetings,
    detailById,
    dateTitles,
    dayEvents,
    weekData: { dateRange, days, events: weekEvents },
    monthEvents,
  };
}
