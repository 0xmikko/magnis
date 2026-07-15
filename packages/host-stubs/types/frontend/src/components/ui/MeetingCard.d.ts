import type { JSX } from "react";
import type { IconName } from "./Icon";
export type MeetingCardDateColor = "accent" | "blue" | "green";
export interface MeetingCardProps {
    /** Day number (e.g. "14") */
    readonly day: string;
    /** Month abbreviation (e.g. "FEB") */
    readonly month: string;
    /** Date block background color */
    readonly dateColor?: MeetingCardDateColor;
    /** Event title */
    readonly title: string;
    /** Time/date description */
    readonly time: string;
    /** Platform icon name */
    readonly platformIcon?: IconName;
    /** Platform label (e.g. "Zoom", "Telegram") */
    readonly platformLabel?: string;
    /** Platform text color */
    readonly platformColor?: "blue" | "purple" | "green";
    /** Click handler */
    readonly onClick?: () => void;
    /** Extra className */
    readonly className?: string;
}
/**
 * Meeting/event card with date block, title, time, and platform.
 * Matches B1 design spec — reusable for calendar events, scheduled meetings.
 */
export declare function MeetingCard({ day, month, dateColor, title, time, platformIcon, platformLabel, platformColor, onClick, className, }: MeetingCardProps): JSX.Element;
