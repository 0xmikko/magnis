import type { ReactNode, JSX } from "react";
export type EntityCardAccent = "cyan" | "amber" | "green" | "blue" | "purple" | "red" | "orange";
export interface EntityCardProps {
    /** Leading element (icon, date badge, avatar) */
    readonly leading?: ReactNode;
    /** Primary text */
    readonly title: string;
    /** Secondary text or rich content (subtitle, status line) */
    readonly subtitle?: ReactNode;
    /** Trailing element (date badge, action buttons) */
    readonly trailing?: ReactNode;
    /** Left border accent color */
    readonly accent?: EntityCardAccent;
    /** Click handler */
    readonly onClick?: () => void;
    /** Extra className */
    readonly className?: string;
}
/**
 * A card for items within an EntitySection.
 * Shows leading element, title/subtitle, and trailing actions.
 * Optional colored left border accent.
 *
 * Generic — used for meeting cards, task cards, trigger cards, etc.
 */
export declare function EntityCard({ leading, title, subtitle, trailing, accent, onClick, className, }: EntityCardProps): JSX.Element;
