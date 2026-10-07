/** Compact relative time for a past ISO timestamp against a supplied clock
 *  (deterministic — the status contract's render helpers inject `now`). */
export declare function relTime(iso: string, now: Date): string;
/** Whole seconds from `now` to a FUTURE ISO timestamp; never below zero. */
export declare function secondsUntil(iso: string, now: Date): number;
/** Compact countdown to a FUTURE ISO timestamp ("in 45s" / "in 12m"). */
export declare function untilTime(iso: string, now: Date): string;
/** A duration ahead, as the sync status prints it: `less than a minute`,
 *  `N min`, `N h M min`, `N d H h`. */
export declare function formatDuration(seconds: number): string;
export declare function formatTimeAgo(timestamp: string): string;
export declare function formatEmailDate(timestamp: string): string;
export declare function formatMessageTime(timestamp: string): string;
export declare function formatDateSeparator(date: Date): {
    label: string;
    isToday: boolean;
};
