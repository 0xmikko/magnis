import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { ModuleLayout } from "@magnis/host/layout";
import { Icon, IconButton, AgendaList, MiniCalendar, ModuleListItem, TopBarHeader, DateBadge, TOPBAR_AVATAR_SIZE } from "@magnis/host/ui";
import type { AgendaGroup } from "@magnis/host/ui";
import { PaneContent, PaneFrame, PaneHeaderBar, DetailPane } from "@magnis/host/layout";
import { ListPaneHeaderActions } from "@magnis/host/base";
import { useAppRuntime } from "@magnis/host/runtime";
import { MeetingsDetail } from "./MeetingsDetail";
import { MeetingListItemContent } from "./MeetingListItemContent";
import { useMeetingsData } from "./hooks/useMeetingsData";
import { buildAgendaGroups, getMeeting, mapMeetingFromApi } from "./helpers";
import { useModuleList } from "@magnis/host/runtime";
import { meetingKeys } from "./queries";
import { createMeetingFromHeaderButton } from "./createMeeting";
import { DAY_NAMES_LONG, MONTH_NAMES, MONTH_ABBR_UPPER } from "./index";
import type { MeetingListItem, MeetingItem } from "./types";

function scrollToDate(container: HTMLDivElement | null, date: Date): void {
  if (!container) return;
  const dateStr = date.toISOString().slice(0, 10);
  const el = container.querySelector(`[data-date="${dateStr}"]`);
  if (!el) return;
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  container.scrollTop += elRect.top - containerRect.top;
}

export function MeetingsModule(): JSX.Element {
  const runtime = useAppRuntime();
  const data = useMeetingsData();
  const list = useModuleList<MeetingListItem, MeetingItem>({
    rpcMethod: "meetings.list",
    queryKeyBase: meetingKeys.all,
    mapItem: mapMeetingFromApi,
    getId: (m) => m.id,
  });

  const { meetings } = data;
   
  const rawMeetings = useMemo(() => data.rawMeetings ?? [], [data.rawMeetings]);
  const meetingsMap = useMemo(
    () => new Map(meetings.map((m) => [m.id, m])),
    [meetings],
  );

  // Build groups from ALL meetings (no date range filter)
  const agendaGroups = useMemo(
    () => buildAgendaGroups(rawMeetings, new Date(0), new Date(2100, 0, 1)),
    [rawMeetings],
  );

  const groups: readonly AgendaGroup[] = useMemo(() => {
    const q = list.searchQuery.toLowerCase();
    return agendaGroups
      .map((group) => ({
        date: group.date,
        items: group.meetingIds
          .map((id) => meetingsMap.get(id))
          .filter((m): m is NonNullable<typeof m> => {
            if (!m) return false;
            if (!q) return true;
            return m.title.toLowerCase().includes(q) || m.with.toLowerCase().includes(q);
          })
          .map((m) => ({
            id: m.id,
            content: (
              <ModuleListItem selected={m.id === list.selectedId}>
                <MeetingListItemContent meeting={m} />
              </ModuleListItem>
            ),
          })),
      }))
      .filter((group) => group.items.length > 0);
  }, [agendaGroups, meetingsMap, list.searchQuery, list.selectedId]);

  const meeting = list.selectedId ? getMeeting(meetings, list.selectedId) : undefined;

  // Scroll container ref
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Scroll to the nearest UPCOMING day (today or the next event) and select its
  // first event on initial load. Groups are chronological ascending, so this
  // puts the closest upcoming meeting at the top of the viewport with past
  // events above (scroll up) and later events below. Falls back to the last
  // (most recent) group when every meeting is in the past.
  useEffect(() => {
    if (hasScrolledRef.current || groups.length === 0) return;
    hasScrolledRef.current = true;

    const todayTs = new Date().setHours(0, 0, 0, 0);
    const targetGroup = groups.find((g) => g.date.getTime() >= todayTs) ?? groups.at(-1);
    if (!targetGroup) return;

    const firstItem = targetGroup.items.at(0);
    if (firstItem && !list.selectedId) {
      list.setSelectedId(firstItem.id);
    }

    scrollToDate(scrollRef.current, targetGroup.date);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, list.selectedId, list.setSelectedId]);

  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());
  const [displayMonth, setDisplayMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  const handleDateClick = useCallback((date: Date) => {
    setCalendarDate(date);
    setDisplayMonth(new Date(date.getFullYear(), date.getMonth(), 1));

    const clickedTs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    // Groups are ascending: scroll to the clicked day, else the nearest day on/after it.
    const targetGroup = groups.find((g) => g.date.getTime() >= clickedTs);
    if (!targetGroup) return;

    requestAnimationFrame(() => {
      scrollToDate(scrollRef.current, targetGroup.date);
    });
  }, [groups]);

  return (
    <ModuleLayout
      moduleName="Meetings"
      listPane={
        <PaneFrame tone="surface-secondary">
          <PaneHeaderBar
            tone="surface-secondary"
            inset="md"
            withBottomBorder={false}
            className="justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold leading-tight text-content">
                {data.listTitle}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <ListPaneHeaderActions
                runtime={runtime}
                icon="plus"
                onAction={createMeetingFromHeaderButton}
                onCreated={list.setSelectedId}
                invalidateKeys={meetingKeys.all}
              />
            </div>
          </PaneHeaderBar>
          <div className="px-4 pb-3">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-edge bg-surface-tertiary px-3">
              <Icon name="search" size={14} className="text-content-muted" />
              <input
                type="search"
                className="h-full w-full border-none bg-transparent text-[13px] text-content outline-none placeholder:text-content-muted"
                placeholder="Search..."
                aria-label="Search"
                onChange={(e) => { list.setSearchQuery(e.target.value); }}
              />
            </div>
          </div>

          <PaneContent ref={scrollRef}>
            <AgendaList
              groups={groups}
              selectedId={list.selectedId ?? undefined}
              onItemClick={list.setSelectedId}
            />
          </PaneContent>

          <div className="shrink-0 border-t border-edge bg-surface-secondary px-4 py-2">
            <MiniCalendar
              selectedDate={calendarDate}
              displayMonth={displayMonth}
              onDateClick={handleDateClick}
              onMonthChange={(delta) => {
                setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
              }}
            />
          </div>
        </PaneFrame>
      }
      detailPane={
        <DetailPane
          headerNode={meeting?.starts_at ? ((): JSX.Element => {
            const d = new Date(meeting.starts_at);
            const dayStr = String(d.getDate());
            const monthStr = MONTH_ABBR_UPPER[d.getMonth()] ?? "";
            const timeInfo = `${DAY_NAMES_LONG[d.getDay()] ?? ""}, ${MONTH_NAMES[d.getMonth()] ?? ""} ${String(d.getDate())} · ${meeting.time}`;
            return (
              <TopBarHeader
                leading={<DateBadge day={dayStr} month={monthStr} size={TOPBAR_AVATAR_SIZE === "lg" ? "lg" : "md"} />}
                title={meeting.title}
                subtitle={timeInfo}
                actions={
                  <IconButton variant="ghost"><Icon name="ellipsis-vertical" size={15} /></IconButton>
                }
              />
            );
          })() : (
            <TopBarHeader
              leading={null}
              title={meeting?.title ?? "Meetings"}
            />
          )}
        >
          <MeetingsDetail meeting={meeting ?? null} data={data} />
        </DetailPane>
      }
    />
  );
}
