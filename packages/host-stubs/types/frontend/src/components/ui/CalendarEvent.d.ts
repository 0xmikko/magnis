import type { JSX } from "react";
export interface CalendarEventProps {
    /** Event title */
    readonly title: string;
    /** Time label */
    readonly time?: string;
    /** Color token: "blue", "green", "orange", "red" */
    readonly color: string;
    /** Extra className (for grid positioning) */
    readonly className?: string;
    /** Inline style (for grid placement) */
    readonly style?: React.CSSProperties;
    /** Display size */
    readonly size?: "sm" | "md";
}
/**
 * A colored calendar event block. Supports both list and grid layouts.
 */
export declare function CalendarEvent({ title, time, color, className, style, size, }: CalendarEventProps): JSX.Element;
