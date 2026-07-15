import type { JSX } from "react";
export interface WeekDay {
    readonly day: string;
    readonly date: string;
    readonly highlight?: boolean;
}
export interface WeekEvent {
    readonly title: string;
    readonly time?: string;
    readonly color: string;
    readonly column?: number;
    readonly row?: number | string;
}
export interface WeekCalendarProps {
    /** Date range label shown in navigation */
    readonly dateRange: string;
    /** Day column headers */
    readonly days: readonly WeekDay[];
    /** Events to render in the grid */
    readonly events: readonly WeekEvent[];
    /** Left-side time labels */
    readonly timeLabels: readonly string[];
    /** Hide the built-in NavArrows (when external navigation is provided) */
    readonly hideNav?: boolean;
    /** Extra className */
    readonly className?: string;
}
/**
 * A week-view calendar with day columns, time rows, and event blocks.
 */
export declare function WeekCalendar({ dateRange, days, events, timeLabels, hideNav, className, }: WeekCalendarProps): JSX.Element;
