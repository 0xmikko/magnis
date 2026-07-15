import type { JSX } from "react";
export interface MonthEvent {
    readonly title: string;
    readonly color: string;
    readonly dayIndex: number;
}
export interface MonthCalendarProps {
    /** Events plotted on the month grid */
    readonly events: readonly MonthEvent[];
    /** Number of days to render (default: 30) */
    readonly dayCount?: number;
    /** Extra className */
    readonly className?: string;
}
/**
 * A month-view calendar grid with optional event indicators.
 */
export declare function MonthCalendar({ events, dayCount, className }: MonthCalendarProps): JSX.Element;
