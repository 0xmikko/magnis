import type { JSX } from "react";
export interface DayScheduleEvent {
    readonly title: string;
    readonly time?: string;
    readonly color: string;
}
export interface DayScheduleProps {
    /** List of events for the day */
    readonly events: readonly DayScheduleEvent[];
    /** Extra className */
    readonly className?: string;
}
/**
 * A vertical list of calendar events for a single day.
 */
export declare function DaySchedule({ events, className }: DayScheduleProps): JSX.Element;
