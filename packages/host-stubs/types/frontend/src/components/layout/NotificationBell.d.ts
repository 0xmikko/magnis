import type { JSX } from "react";
export interface NotificationBellProps {
    /** Number of chats needing a reply — the badge is hidden at 0. */
    readonly count: number;
    readonly onClick: () => void;
}
/**
 * Global needs-reply bell in the command bar, attached right of the
 * "Search or jump to…" field and visible from ANY module. Opens the
 * NeedsReplyPopover quick-switch. Round-4 polish: h-9 matches the
 * search field's 36px height, the badge stays inside the button
 * bounds, and focus follows the IconButton pattern — outline only on
 * keyboard :focus-visible, never a ring on mouse click.
 */
export declare function NotificationBell({ count, onClick }: NotificationBellProps): JSX.Element;
