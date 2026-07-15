import type { JSX } from "react";
export interface DateBadgeProps {
    readonly day: string;
    readonly month: string;
    readonly size?: "sm" | "md" | "lg";
}
/**
 * A date badge showing day number and month abbreviation.
 * Used in meetings (list + detail) and contacts (meeting entries).
 */
export declare function DateBadge({ day, month, size }: DateBadgeProps): JSX.Element;
