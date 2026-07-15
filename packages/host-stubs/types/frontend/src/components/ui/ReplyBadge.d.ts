import type { JSX } from "react";
export interface ReplyBadgeProps {
    /** Badge label text */
    readonly label: string;
    /** Extra className */
    readonly className?: string;
}
/**
 * A small muted pill badge for reply indicators.
 */
export declare function ReplyBadge({ label, className }: ReplyBadgeProps): JSX.Element;
