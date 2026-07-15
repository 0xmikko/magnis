import type { ReactNode, JSX } from "react";
export interface ActivityRowProps {
    /** Leading element: IconBox, DateBadge, or any visual marker */
    readonly leading: ReactNode;
    /** Primary text */
    readonly title: string;
    /** Secondary text */
    readonly subtitle?: string;
    /** Tertiary metadata text */
    readonly meta?: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A row with a leading icon/badge area and stacked text content.
 * Used for email entries, meeting entries, activity feed items.
 */
export declare function ActivityRow({ leading, title, subtitle, meta, className }: ActivityRowProps): JSX.Element;
