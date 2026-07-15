import type { JSX } from "react";
export interface UnreadCountProps {
    /** Unread count to display */
    readonly count: number;
    /** Extra className */
    readonly className?: string;
}
/**
 * A circular unread-message count badge.
 */
export declare function UnreadCount({ count, className }: UnreadCountProps): JSX.Element;
