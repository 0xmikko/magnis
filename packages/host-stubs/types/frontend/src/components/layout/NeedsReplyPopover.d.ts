import type { JSX } from "react";
import type { NeedsReplyEpisode } from "../../modules/episodes/helpers";
interface NeedsReplyPopoverProps {
    readonly error?: string;
    readonly items: readonly NeedsReplyEpisode[];
    /** Focus this Episode within its root conversation. */
    readonly onSelect: (episodeId: string) => void;
    readonly onClose: () => void;
}
/**
 * Dropdown for the command-bar needs-reply bell, copied from the
 * ServiceErrorPopover precedent (ul items with icon + title +
 * time-ago, plain single-line empty state, outside-mousedown close).
 * No header row — the bell already says what the dropdown is.
 * The close check measures from the ANCHOR wrapper (parentElement) so
 * a mousedown on the bell toggle itself does not close-then-reopen.
 */
export declare function NeedsReplyPopover({ items, error, onSelect, onClose, }: NeedsReplyPopoverProps): JSX.Element;
export {};
