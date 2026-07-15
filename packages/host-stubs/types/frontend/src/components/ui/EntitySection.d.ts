import type { ReactNode, JSX } from "react";
export type CountBadgeColor = "blue" | "green" | "orange" | "red" | "purple" | "amber";
export interface EntitySectionProps {
    /** Leading icon/emoji element */
    readonly icon: ReactNode;
    /** Section title */
    readonly title: string;
    /** Count badge (number or text like "3 active") */
    readonly count?: number | string;
    /** Color of the count badge */
    readonly countColor?: CountBadgeColor;
    /** "Show more" label — hidden if undefined */
    readonly showMoreLabel?: string;
    /** Called when "Show more" is clicked */
    readonly onShowMore?: () => void;
    /** Extra className */
    readonly className?: string;
    /** Section content (cards, rows, etc.) */
    readonly children: ReactNode;
}
/**
 * A titled content section for entity detail pages.
 * Renders a header row (icon + title + count badge) followed by child content.
 * Optional "Show more" link at the bottom.
 *
 * Generic — used for Meetings, Tasks, Triggers, Notes, etc.
 */
export declare function EntitySection({ icon, title, count, countColor, showMoreLabel, onShowMore, className, children, }: EntitySectionProps): JSX.Element;
