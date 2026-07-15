import type { JSX } from "react";
import type { IconName } from "./Icon";
export type EventBadgeColor = "amber" | "blue" | "green" | "purple" | "accent";
export interface EventCardProps {
    /** Leading icon name */
    readonly icon: IconName;
    /** Icon color class */
    readonly iconColor?: string;
    /** Event title */
    readonly title: string;
    /** Subtitle (time, location) */
    readonly subtitle: string;
    /** Date badge text (e.g. "Feb 14") */
    readonly dateBadge?: string;
    /** Date badge color */
    readonly dateBadgeColor?: EventBadgeColor;
    /** Click handler */
    readonly onClick?: () => void;
    /** Extra className */
    readonly className?: string;
}
/**
 * Compact event card with icon, title, date badge on right, and subtitle.
 * Matches B1 Pencil design — used for Meetings section.
 */
export declare function EventCard({ icon, iconColor, title, subtitle, dateBadge, dateBadgeColor, onClick, className, }: EventCardProps): JSX.Element;
