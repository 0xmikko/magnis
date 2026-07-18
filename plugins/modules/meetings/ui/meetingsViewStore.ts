/**
 * Shared view state for the Meetings module.
 *
 * Both renderList and renderDetail call useMeetingsView() to read the
 * current view mode and date offset. Updates trigger re-renders in both
 * panes via useSyncExternalStore.
 */

import { useSyncExternalStore } from "react";
import { DAY_NAMES_LONG, MONTH_ABBR, MONTH_NAMES } from "./index";

export type MeetingsView = "day" | "week" | "month";

export interface MeetingsViewState {
  readonly view: MeetingsView;
  readonly dateOffset: number; // 0 = current, +1 = next period, -1 = prev
}

// ── Store internals ──────────────────────────────────────────────────

let state: MeetingsViewState = { view: "week", dateOffset: 0 };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MeetingsViewState {
  return state;
}

// ── Public API ───────────────────────────────────────────────────────

export function useMeetingsView(): MeetingsViewState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setMeetingsView(view: MeetingsView): void {
  state = { view, dateOffset: 0 };
  emit();
}

export function nudgeDate(delta: -1 | 1): void {
  state = { ...state, dateOffset: state.dateOffset + delta };
  emit();
}

/** Compute the anchor date for the given view + offset. */
export function getAnchorDate(view: MeetingsView, offset: number): Date {
  const now = new Date();
  if (view === "day") {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  }
  if (view === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() + offset * 7);
    return d;
  }
  // month
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d;
}

/** Jump to a specific date within the current view mode. */
export function setAnchorDate(target: Date): void {
  const now = new Date();
  const { view } = state;

  if (view === "day") {
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diff = Math.round((targetStart.getTime() - nowStart.getTime()) / (1000 * 60 * 60 * 24));
    state = { view, dateOffset: diff };
  } else if (view === "week") {
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diff = Math.round((targetStart.getTime() - nowStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
    state = { view, dateOffset: diff };
  } else {
    // month
    const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    state = { view, dateOffset: diff };
  }

  emit();
}

// ── Label & range helpers ────────────────────────────────────────────

/** Human-readable label for NavArrows. */
export function getDateLabel(view: MeetingsView, dateOffset: number): string {
  const d = getAnchorDate(view, dateOffset);
  if (view === "day") {
    const dayName = DAY_NAMES_LONG[d.getDay()];
    const monthAbbr = MONTH_ABBR[d.getMonth()];
    return `${dayName}, ${monthAbbr} ${d.getDate()}, ${d.getFullYear()}`;
  }
  if (view === "week") {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mAbbr = MONTH_ABBR[monday.getMonth()];
    const sAbbr = MONTH_ABBR[sunday.getMonth()];
    if (monday.getMonth() === sunday.getMonth()) {
      return `${mAbbr} ${monday.getDate()} - ${sunday.getDate()}, ${sunday.getFullYear()}`;
    }
    return `${mAbbr} ${monday.getDate()} - ${sAbbr} ${sunday.getDate()}, ${sunday.getFullYear()}`;
  }
  // month
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Date range { start, end } for filtering meetings by starts_at. */
export function getDateRange(
  view: MeetingsView,
  dateOffset: number,
): { start: Date; end: Date } {
  const d = getAnchorDate(view, dateOffset);
  if (view === "day") {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (view === "week") {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7); // exclusive end
    return { start: monday, end: sunday };
  }
  // month
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end };
}
