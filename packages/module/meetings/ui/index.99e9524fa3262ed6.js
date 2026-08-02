// plugins/modules/meetings/ui/index.tsx
import { Icon as Icon4 } from "/api/plugins/__host-shim.js?m=ui";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/meetings/ui/MeetingsModule.tsx
import { useCallback as useCallback2, useEffect, useMemo as useMemo2, useRef, useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
import { ModuleLayout } from "/api/plugins/__host-shim.js?m=layout";
import { Icon as Icon2, IconButton, AgendaList, MiniCalendar, ModuleListItem, TopBarHeader, DateBadge, TOPBAR_AVATAR_SIZE } from "/api/plugins/__host-shim.js?m=ui";
import { PaneContent, PaneFrame, PaneHeaderBar, DetailPane } from "/api/plugins/__host-shim.js?m=layout";
import { ListPaneHeaderActions } from "/api/plugins/__host-shim.js?m=base";
import { useAppRuntime as useAppRuntime3 } from "/api/plugins/__host-shim.js?m=runtime";

// plugins/modules/meetings/ui/MeetingsDetail.tsx
import { useCallback, useState } from "/api/plugins/__host-shim.js?m=react";
import {
  Avatar,
  Icon,
  Stack,
  Row,
  Text
} from "/api/plugins/__host-shim.js?m=ui";
import { useAppRuntime } from "/api/plugins/__host-shim.js?m=runtime";
import { useRouterContext } from "/api/plugins/__host-shim.js?m=runtime";
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function getMeetingDetail(detailById, id) {
  return detailById[id];
}
function isGoogleMeetLocation(location) {
  const lower = location.toLowerCase();
  return lower.includes("google meet") || lower.includes("meet.google");
}
function MeetingsDetail({ meeting, data }) {
  if (!meeting) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex items-center justify-center h-full text-content-tertiary text-base",
      children: "Select a meeting to view details"
    });
  }
  const detail = getMeetingDetail(data.detailById, meeting.id);
  if (!detail) {
    return /* @__PURE__ */ jsx(Stack, {
      gap: 4,
      px: 5,
      py: 4,
      children: /* @__PURE__ */ jsx("div", {
        className: "rounded-xl border border-edge bg-surface-secondary px-4 py-3 text-content-secondary text-sm",
        children: "Meeting details are not available yet for this item."
      })
    });
  }
  return /* @__PURE__ */ jsx(MeetingsDetailBody, {
    detail
  });
}
function MeetingsDetailBody({ detail }) {
  const runtime = useAppRuntime();
  const router = useRouterContext();
  const [busyEmail, setBusyEmail] = useState(null);
  const goToContact = useCallback((id) => {
    router.navigate("contacts", "person", id);
  }, [router]);
  const createContactAndGo = useCallback(async (attendee) => {
    if (!attendee.email)
      return;
    setBusyEmail(attendee.email);
    try {
      const created = await runtime.transport.rpc("contacts.create", { name: attendee.name || attendee.email, email: attendee.email });
      const domain = attendee.email.split("@")[1] ?? "";
      const root = domain.split(".")[0] ?? "";
      if (root) {
        try {
          const companies = await runtime.transport.rpc("companies.list", { search: root });
          const match = companies.items.at(0);
          if (match) {
            await runtime.transport.rpc("graph.link.add", {
              from: created.id,
              to: match.id,
              kind: "works_at"
            });
          }
        } catch {}
      }
      goToContact(created.id);
    } finally {
      setBusyEmail(null);
    }
  }, [runtime, goToContact]);
  return /* @__PURE__ */ jsxs(Stack, {
    gap: 6,
    px: 6,
    py: 4,
    children: [
      detail.location && /* @__PURE__ */ jsxs(Stack, {
        gap: 1,
        children: [
          /* @__PURE__ */ jsx(Text, {
            variant: "caption",
            weight: "semibold",
            color: "tertiary",
            children: "Where"
          }),
          /* @__PURE__ */ jsxs(Row, {
            gap: 2,
            align: "center",
            children: [
              /* @__PURE__ */ jsx(Icon, {
                name: isGoogleMeetLocation(detail.location) ? "video" : "map-pin",
                size: 14,
                className: "text-content-tertiary shrink-0"
              }),
              detail.conferenceLink ? /* @__PURE__ */ jsx("a", {
                href: detail.conferenceLink,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-sm text-accent hover:underline",
                children: "Join with Google Meet"
              }) : /* @__PURE__ */ jsx(Text, {
                variant: "body",
                color: "secondary",
                children: detail.location
              })
            ]
          })
        ]
      }),
      /* @__PURE__ */ jsxs(Stack, {
        gap: 1,
        children: [
          /* @__PURE__ */ jsx(Text, {
            variant: "caption",
            weight: "semibold",
            color: "tertiary",
            children: "Agenda"
          }),
          detail.description ? /* @__PURE__ */ jsx(Text, {
            variant: "body",
            color: "secondary",
            leading: "relaxed",
            className: "whitespace-pre-wrap",
            children: detail.description
          }) : /* @__PURE__ */ jsx(Text, {
            variant: "body",
            color: "tertiary",
            leading: "relaxed",
            children: "No agenda yet."
          })
        ]
      }),
      detail.attendees.length > 0 && /* @__PURE__ */ jsxs(Stack, {
        gap: 2,
        children: [
          /* @__PURE__ */ jsxs(Text, {
            variant: "caption",
            weight: "semibold",
            color: "tertiary",
            children: [
              "Guests (",
              detail.attendees.length,
              ")"
            ]
          }),
          /* @__PURE__ */ jsx(Stack, {
            gap: 1.5,
            children: detail.attendees.map((attendee) => {
              const known = Boolean(attendee.contactId);
              const busy = busyEmail === attendee.email;
              const handleClick = () => {
                if (busy)
                  return;
                if (attendee.contactId) {
                  goToContact(attendee.contactId);
                } else {
                  createContactAndGo(attendee);
                }
              };
              return /* @__PURE__ */ jsxs("button", {
                type: "button",
                onClick: handleClick,
                className: "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 text-left transition-colors hover:bg-surface-hover cursor-pointer",
                children: [
                  /* @__PURE__ */ jsx(Avatar, {
                    label: attendee.initials,
                    color: attendee.color,
                    size: "sm"
                  }),
                  /* @__PURE__ */ jsxs(Stack, {
                    gap: 0,
                    className: "min-w-0 flex-1",
                    children: [
                      /* @__PURE__ */ jsxs(Row, {
                        gap: 2,
                        align: "center",
                        children: [
                          /* @__PURE__ */ jsx(Text, {
                            variant: "body",
                            weight: "medium",
                            color: known ? "default" : "tertiary",
                            children: attendee.name || attendee.initials
                          }),
                          attendee.role && /* @__PURE__ */ jsx(Text, {
                            variant: "caption",
                            color: "tertiary",
                            children: attendee.role
                          }),
                          !known && /* @__PURE__ */ jsx(Text, {
                            variant: "caption",
                            color: "tertiary",
                            children: busy ? "· adding…" : "· not in contacts"
                          })
                        ]
                      }),
                      attendee.email && /* @__PURE__ */ jsx(Text, {
                        variant: "caption",
                        color: "tertiary",
                        children: attendee.email
                      })
                    ]
                  }),
                  /* @__PURE__ */ jsx(Icon, {
                    name: "chevron-right",
                    size: 14,
                    className: "text-content-tertiary shrink-0"
                  })
                ]
              }, attendee.initials + (attendee.email ?? ""));
            })
          })
        ]
      })
    ]
  });
}

// plugins/modules/meetings/ui/MeetingListItemContent.tsx
import {
  Avatar as Avatar2,
  Stack as Stack2,
  Text as Text2
} from "/api/plugins/__host-shim.js?m=ui";
import { jsx as jsx2, jsxs as jsxs2, Fragment } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function MeetingListItemContent({ meeting }) {
  return /* @__PURE__ */ jsxs2(Fragment, {
    children: [
      /* @__PURE__ */ jsx2(Avatar2, {
        label: meeting.initials,
        color: meeting.color,
        size: "md"
      }),
      /* @__PURE__ */ jsxs2(Stack2, {
        gap: 0.5,
        flex1: true,
        children: [
          /* @__PURE__ */ jsx2(Text2, {
            variant: "title",
            truncate: true,
            className: "list-item-title",
            children: meeting.title
          }),
          /* @__PURE__ */ jsx2(Text2, {
            variant: "caption",
            truncate: true,
            className: "list-item-secondary",
            children: meeting.time
          })
        ]
      })
    ]
  });
}

// plugins/modules/meetings/ui/hooks/useMeetingsData.ts
import { useMemo } from "/api/plugins/__host-shim.js?m=react";

// plugins/modules/meetings/ui/helpers.ts
import { pickAvatarColor, initialsFromName } from "/api/plugins/__host-shim.js?m=utils";
function attendeeDisplay(a) {
  return a.name ?? a.email;
}
function requireStart(m) {
  if (m.starts_at === null)
    throw new Error("meeting has no starts_at");
  return new Date(m.starts_at);
}
function mapMeetingFromApi(m) {
  const title = m.title.trim() ? m.title.trim() : "Untitled meeting";
  const attendees = m.attendees.filter((a) => a.email.trim().length > 0);
  const attendeeLabels = attendees.map(attendeeDisplay);
  const withText = attendeeLabels.length > 0 ? attendeeLabels.join(", ") : "No attendees";
  const date = m.date?.trim() ? m.date : "TBD";
  const time = m.time?.trim() ? m.time : "TBD";
  const trimmedLocation = m.location?.trim();
  let preview;
  if (trimmedLocation) {
    preview = trimmedLocation;
  } else {
    preview = attendeeLabels.length > 0 ? attendeeLabels.slice(0, 2).join(", ") : "No location";
  }
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
    location: m.location ?? undefined
  };
}
function buildDayEvents(meetings) {
  const today = new Date().toISOString().slice(0, 10);
  return meetings.filter((m) => m.starts_at?.slice(0, 10) === today).map((m) => ({
    title: m.title,
    time: m.time ?? "",
    color: pickAvatarColor(m.id)
  }));
}
function buildWeekEvents(meetings) {
  const now = new Date;
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day + 6) % 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return meetings.filter((m) => {
    if (!m.starts_at)
      return false;
    const d = new Date(m.starts_at);
    return d >= monday && d < sunday;
  }).map((m) => {
    const d = requireStart(m);
    const col = (d.getDay() + 6) % 7 + 1;
    return {
      title: m.title,
      time: m.time ?? "",
      color: pickAvatarColor(m.id),
      column: col
    };
  });
}
function buildMonthEvents(meetings) {
  const now = new Date;
  const year = now.getFullYear();
  const month = now.getMonth();
  return meetings.filter((m) => {
    if (!m.starts_at)
      return false;
    const d = new Date(m.starts_at);
    return d.getFullYear() === year && d.getMonth() === month;
  }).map((m) => {
    const d = requireStart(m);
    return {
      dayIndex: d.getDate() - 1,
      title: m.title,
      color: pickAvatarColor(m.id)
    };
  });
}
function buildCurrentDateTitles() {
  const now = new Date;
  const dayName = DAY_NAMES_LONG[now.getDay()];
  const monthName = MONTH_NAMES[now.getMonth()];
  if (dayName === undefined || monthName === undefined)
    throw new Error("date name index out of range");
  const dateStr = `${dayName}, ${monthName} ${String(now.getDate())}, ${String(now.getFullYear())}`;
  return {
    detail: dateStr,
    day: dateStr,
    month: `${monthName} ${String(now.getFullYear())}`
  };
}
function buildCurrentWeekDays() {
  const now = new Date;
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek + 6) % 7);
  const days = [];
  for (let i = 0;i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      day: DAY_NAMES_SHORT[d.getDay()] ?? "",
      date: String(d.getDate()),
      highlight: d.toDateString() === now.toDateString()
    });
  }
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const rangeMonth = MONTH_NAMES[monday.getMonth()];
  if (rangeMonth === undefined)
    throw new Error("date name index out of range");
  const dateRange = `${rangeMonth} ${String(monday.getDate())} - ${String(sunday.getDate())}, ${String(sunday.getFullYear())}`;
  return { dateRange, days };
}
function buildAgendaGroups(meetings, start, end) {
  const byDate = new Map;
  for (const m of meetings) {
    if (!m.starts_at)
      continue;
    const d = new Date(m.starts_at);
    if (d < start || d >= end)
      continue;
    const key = d.toISOString().slice(0, 10);
    let bucket = byDate.get(key);
    if (!bucket) {
      bucket = { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      byDate.set(key, bucket);
    }
    bucket.items.push({ id: m.id, startsAt: d.getTime() });
  }
  const groups = Array.from(byDate.values()).map((bucket) => {
    bucket.items.sort((a, b) => a.startsAt - b.startsAt);
    return { date: bucket.date, meetingIds: bucket.items.map((i) => i.id) };
  });
  return groups.sort((a, b) => a.date.getTime() - b.date.getTime());
}
function getMeeting(meetings, id) {
  if (meetings.length === 0)
    return;
  const meetingsMap = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  return meetingsMap.get(id) ?? meetings[0];
}
function buildMeetingDetail(m) {
  const startsAt = m.starts_at ? new Date(m.starts_at) : null;
  const endsAt = m.ends_at ? new Date(m.ends_at) : null;
  const dateDay = startsAt ? String(startsAt.getDate()) : "";
  const dateMonth = startsAt ? MONTH_ABBR_UPPER[startsAt.getMonth()] ?? "" : "";
  let subtitle = m.time ?? "";
  if (startsAt && endsAt) {
    const durationMs = endsAt.getTime() - startsAt.getTime();
    const durationMins = Math.round(durationMs / 60000);
    if (durationMins >= 60) {
      const hours = Math.floor(durationMins / 60);
      const mins = durationMins % 60;
      subtitle += ` (${String(hours)}h${mins > 0 ? ` ${String(mins)}m` : ""})`;
    } else if (durationMins > 0) {
      subtitle += ` (${String(durationMins)}m)`;
    }
  }
  const rawAttendees = m.attendees.filter((a) => a.email.trim().length > 0);
  const attendees = rawAttendees.map((a, i) => {
    const displayName = a.name ?? a.email;
    return {
      initials: initialsFromName(displayName) === "?" ? "ME" : initialsFromName(displayName),
      name: displayName,
      email: a.email,
      role: i === 0 ? "Organizer" : "Required",
      color: pickAvatarColor(a.email),
      contactId: a.contact_id ?? undefined
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
    actions: []
  };
}

// plugins/modules/meetings/ui/queries.ts
import { useQuery } from "/api/plugins/__host-shim.js?m=react-query";
import { useAppRuntime as useAppRuntime2 } from "/api/plugins/__host-shim.js?m=runtime";
var meetingKeys = {
  all: ["meetings"],
  list: (params) => [...meetingKeys.all, "list", params],
  detail: (id) => [...meetingKeys.all, "detail", id]
};
function useMeetingsListQuery(limit = 100, offset = 0) {
  const runtime = useAppRuntime2();
  return useQuery({
    queryKey: meetingKeys.list({ limit, offset }),
    queryFn: () => runtime.transport.rpc("meetings.list", { limit, offset }),
    staleTime: 30000
  });
}

// plugins/modules/meetings/ui/hooks/useMeetingsData.ts
function useMeetingsData() {
  const { data } = useMeetingsListQuery();
  const rawMeetings = data?.items ?? [];
  const meetings = useMemo(() => rawMeetings.map(mapMeetingFromApi), [rawMeetings]);
  const detailById = useMemo(() => {
    const details = {};
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
    monthEvents
  };
}

// plugins/modules/meetings/ui/MeetingsModule.tsx
import { useModuleList } from "/api/plugins/__host-shim.js?m=runtime";

// plugins/modules/meetings/ui/createMeeting.ts
async function createMeetingFromHeaderButton(runtime, onCreated) {
  const startsAt = new Date;
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const result = await runtime.transport.rpc("meetings.create", {
    title: "Untitled Meeting",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    client_id: crypto.randomUUID()
  });
  onCreated(result.id);
}

// plugins/modules/meetings/ui/MeetingsModule.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function scrollToDate(container, date) {
  if (!container)
    return;
  const dateStr = date.toISOString().slice(0, 10);
  const el = container.querySelector(`[data-date="${dateStr}"]`);
  if (!el)
    return;
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  container.scrollTop += elRect.top - containerRect.top;
}
function MeetingsModule() {
  const runtime = useAppRuntime3();
  const data = useMeetingsData();
  const list = useModuleList({
    rpcMethod: "meetings.list",
    queryKeyBase: meetingKeys.all,
    mapItem: mapMeetingFromApi,
    getId: (m) => m.id
  });
  const { meetings } = data;
  const rawMeetings = useMemo2(() => data.rawMeetings ?? [], [data.rawMeetings]);
  const meetingsMap = useMemo2(() => new Map(meetings.map((m) => [m.id, m])), [meetings]);
  const agendaGroups = useMemo2(() => buildAgendaGroups(rawMeetings, new Date(0), new Date(2100, 0, 1)), [rawMeetings]);
  const groups = useMemo2(() => {
    const q = list.searchQuery.toLowerCase();
    return agendaGroups.map((group) => ({
      date: group.date,
      items: group.meetingIds.map((id) => meetingsMap.get(id)).filter((m) => {
        if (!m)
          return false;
        if (!q)
          return true;
        return m.title.toLowerCase().includes(q) || m.with.toLowerCase().includes(q);
      }).map((m) => ({
        id: m.id,
        content: /* @__PURE__ */ jsx3(ModuleListItem, {
          selected: m.id === list.selectedId,
          children: /* @__PURE__ */ jsx3(MeetingListItemContent, {
            meeting: m
          })
        })
      }))
    })).filter((group) => group.items.length > 0);
  }, [agendaGroups, meetingsMap, list.searchQuery, list.selectedId]);
  const meeting = list.selectedId ? getMeeting(meetings, list.selectedId) : undefined;
  const scrollRef = useRef(null);
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (hasScrolledRef.current || groups.length === 0)
      return;
    hasScrolledRef.current = true;
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const targetGroup = groups.find((g) => g.date.getTime() >= todayTs) ?? groups.at(-1);
    if (!targetGroup)
      return;
    const firstItem = targetGroup.items.at(0);
    if (firstItem && !list.selectedId) {
      list.setSelectedId(firstItem.id);
    }
    scrollToDate(scrollRef.current, targetGroup.date);
  }, [groups, list.selectedId, list.setSelectedId]);
  const [calendarDate, setCalendarDate] = useState2(() => new Date);
  const [displayMonth, setDisplayMonth] = useState2(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const handleDateClick = useCallback2((date) => {
    setCalendarDate(date);
    setDisplayMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    const clickedTs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const targetGroup = groups.find((g) => g.date.getTime() >= clickedTs);
    if (!targetGroup)
      return;
    requestAnimationFrame(() => {
      scrollToDate(scrollRef.current, targetGroup.date);
    });
  }, [groups]);
  return /* @__PURE__ */ jsx3(ModuleLayout, {
    moduleName: "Meetings",
    listPane: /* @__PURE__ */ jsxs3(PaneFrame, {
      tone: "surface-secondary",
      children: [
        /* @__PURE__ */ jsxs3(PaneHeaderBar, {
          tone: "surface-secondary",
          inset: "md",
          withBottomBorder: false,
          className: "justify-between gap-3",
          children: [
            /* @__PURE__ */ jsx3("div", {
              className: "flex items-center gap-2",
              children: /* @__PURE__ */ jsx3("h2", {
                className: "m-0 text-[15px] font-semibold leading-tight text-content",
                children: data.listTitle
              })
            }),
            /* @__PURE__ */ jsx3("div", {
              className: "flex items-center gap-2",
              children: /* @__PURE__ */ jsx3(ListPaneHeaderActions, {
                runtime,
                icon: "plus",
                onAction: createMeetingFromHeaderButton,
                onCreated: list.setSelectedId,
                invalidateKeys: meetingKeys.all
              })
            })
          ]
        }),
        /* @__PURE__ */ jsx3("div", {
          className: "px-4 pb-3",
          children: /* @__PURE__ */ jsxs3("div", {
            className: "flex h-9 items-center gap-2 rounded-lg border border-edge bg-surface-tertiary px-3",
            children: [
              /* @__PURE__ */ jsx3(Icon2, {
                name: "search",
                size: 14,
                className: "text-content-muted"
              }),
              /* @__PURE__ */ jsx3("input", {
                type: "search",
                className: "h-full w-full border-none bg-transparent text-[13px] text-content outline-none placeholder:text-content-muted",
                placeholder: "Search...",
                "aria-label": "Search",
                onChange: (e) => {
                  list.setSearchQuery(e.target.value);
                }
              })
            ]
          })
        }),
        /* @__PURE__ */ jsx3(PaneContent, {
          ref: scrollRef,
          children: /* @__PURE__ */ jsx3(AgendaList, {
            groups,
            selectedId: list.selectedId ?? undefined,
            onItemClick: list.setSelectedId
          })
        }),
        /* @__PURE__ */ jsx3("div", {
          className: "shrink-0 border-t border-edge bg-surface-secondary px-4 py-2",
          children: /* @__PURE__ */ jsx3(MiniCalendar, {
            selectedDate: calendarDate,
            displayMonth,
            onDateClick: handleDateClick,
            onMonthChange: (delta) => {
              setDisplayMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
            }
          })
        })
      ]
    }),
    detailPane: /* @__PURE__ */ jsx3(DetailPane, {
      headerNode: meeting?.starts_at ? (() => {
        const d = new Date(meeting.starts_at);
        const dayStr = String(d.getDate());
        const monthStr = MONTH_ABBR_UPPER[d.getMonth()] ?? "";
        const timeInfo = `${DAY_NAMES_LONG[d.getDay()] ?? ""}, ${MONTH_NAMES[d.getMonth()] ?? ""} ${String(d.getDate())} · ${meeting.time}`;
        return /* @__PURE__ */ jsx3(TopBarHeader, {
          leading: /* @__PURE__ */ jsx3(DateBadge, {
            day: dayStr,
            month: monthStr,
            size: TOPBAR_AVATAR_SIZE === "lg" ? "lg" : "md"
          }),
          title: meeting.title,
          subtitle: timeInfo,
          actions: /* @__PURE__ */ jsx3(IconButton, {
            variant: "ghost",
            children: /* @__PURE__ */ jsx3(Icon2, {
              name: "ellipsis-vertical",
              size: 15
            })
          })
        });
      })() : /* @__PURE__ */ jsx3(TopBarHeader, {
        leading: null,
        title: meeting?.title ?? "Meetings"
      }),
      children: /* @__PURE__ */ jsx3(MeetingsDetail, {
        meeting: meeting ?? null,
        data
      })
    })
  });
}

// plugins/modules/meetings/ui/EntityCards.tsx
import { useContext } from "/api/plugins/__host-shim.js?m=react";
import { Icon as Icon3 } from "/api/plugins/__host-shim.js?m=ui";
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";
import { jsx as jsx4, jsxs as jsxs4 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function attendeesToDisplayList(value) {
  if (!Array.isArray(value))
    return [];
  return value.flatMap((v) => {
    if (typeof v === "string" && v.length > 0)
      return [v];
    if (typeof v === "object" && v !== null && "email" in v && typeof v.email === "string") {
      const obj = v;
      const name = typeof obj.name === "string" && obj.name.length > 0 ? obj.name : null;
      return [name ?? obj.email];
    }
    return [];
  });
}
function description(data) {
  const d = data.description;
  return typeof d === "string" && d.length > 0 ? d : undefined;
}
function agenda(data) {
  const a = data.agenda;
  return typeof a === "string" && a.length > 0 ? a : undefined;
}
function meetingHasMore(data) {
  return description(data) !== undefined || agenda(data) !== undefined || attendeesToDisplayList(data.attendees).length > 0;
}
function Row2({ label, value }) {
  return /* @__PURE__ */ jsxs4("div", {
    className: "flex gap-2 text-[11px]",
    children: [
      /* @__PURE__ */ jsx4("span", {
        className: "w-20 shrink-0 text-content-tertiary",
        children: label
      }),
      /* @__PURE__ */ jsx4("span", {
        className: "min-w-0 flex-1 whitespace-pre-wrap break-words text-content",
        children: value
      })
    ]
  });
}
function MeetingCard(props) {
  const { data, action } = props;
  const title = data.title;
  const date = data.date;
  const time = data.time;
  const location = data.location;
  const attendees = attendeesToDisplayList(data.attendees);
  const { expanded } = useContext(ExpansionContext);
  const dateTime = [date, time].filter(Boolean).join(" · ");
  const attendeeCount = attendees.length;
  const desc = description(data);
  const ag = agenda(data);
  const rows = [];
  if (dateTime)
    rows.push({ label: "When", value: dateTime });
  if (location)
    rows.push({ label: "Location", value: location });
  if (attendees.length > 0)
    rows.push({ label: "Attendees", value: attendees.join(", ") });
  if (ag)
    rows.push({ label: "Agenda", value: ag });
  if (desc)
    rows.push({ label: "Notes", value: desc });
  return /* @__PURE__ */ jsx4(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs4("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs4("span", {
          className: "block truncate text-[12px] font-medium text-content",
          children: [
            /* @__PURE__ */ jsx4(ActionPrefix, {
              action
            }),
            title ?? "Untitled Meeting"
          ]
        }),
        !expanded && /* @__PURE__ */ jsxs4("div", {
          className: "mt-0.5 flex items-baseline gap-2 text-[11px] text-content-tertiary",
          children: [
            dateTime && /* @__PURE__ */ jsx4("span", {
              children: dateTime
            }),
            location && /* @__PURE__ */ jsxs4("span", {
              className: "truncate",
              children: [
                /* @__PURE__ */ jsx4(Icon3, {
                  name: "map-pin",
                  size: 10,
                  className: "mr-0.5 inline-block align-baseline"
                }),
                location
              ]
            }),
            attendeeCount > 0 && /* @__PURE__ */ jsxs4("span", {
              className: "shrink-0",
              children: [
                attendeeCount,
                " attendees"
              ]
            })
          ]
        }),
        expanded && rows.length > 0 && /* @__PURE__ */ jsx4("div", {
          className: "mt-1 flex flex-col gap-1",
          children: rows.map((r) => /* @__PURE__ */ jsx4(Row2, {
            label: r.label,
            value: r.value
          }, r.label))
        })
      ]
    })
  });
}

// plugins/modules/meetings/ui/index.tsx
import { setupEventInvalidation } from "/api/plugins/__host-shim.js?m=runtime";
import { jsx as jsx5 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var MEETINGS_BASE_DATA = {
  listTitle: "Meetings",
  searchPlaceholder: "Search meetings...",
  sidebarTitle: "Context",
  viewTabs: [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" }
  ],
  timeLabels: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"],
  header: { initials: "ME", name: "Meetings", statusText: "Calendar", color: "blue" },
  sidebar: { panelTitle: "Context", sections: [] }
};
var MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
var MONTH_ABBR_UPPER = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC"
];
var DAY_NAMES_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
var DAY_NAMES_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat"
];
var meetingsModuleDef = defineModule({
  id: "meetings",
  title: "Meetings",
  icon: /* @__PURE__ */ jsx5(Icon4, {
    name: "calendar",
    size: 26
  }),
  iconName: "calendar",
  themeColor: "orange",
  entityTypes: ["calendar_event"],
  primaryEntityType: "calendar_event",
  entityLabels: { calendar_event: { icon: "calendar", label: "Meeting" } },
  EntityCard: MeetingCard,
  hasMore: meetingHasMore,
  extraSetup: (runtime) => {
    const unsub = setupEventInvalidation(runtime.transport, runtime.queryClient, ["sync.progress", "source.account.connected"], [["meetings"]]);
    return unsub;
  }
});
var MeetingsModule2 = {
  ...meetingsModuleDef,
  Component: MeetingsModule
};
export {
  MeetingsModule2 as MeetingsModule,
  MONTH_NAMES,
  MONTH_ABBR_UPPER,
  MONTH_ABBR,
  MEETINGS_BASE_DATA,
  DAY_NAMES_SHORT,
  DAY_NAMES_LONG
};
