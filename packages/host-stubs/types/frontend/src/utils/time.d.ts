/** Compact relative time for a past ISO timestamp against a supplied clock
 *  (deterministic — the status contract's render helpers inject `now`). */
export declare function relTime(iso: string, now: Date): string;
/** Compact countdown to a FUTURE ISO timestamp ("in 45s" / "in 12m"). */
export declare function untilTime(iso: string, now: Date): string;
export declare function formatTimeAgo(timestamp: string): string;
export declare function formatEmailDate(timestamp: string): string;
export declare function formatMessageTime(timestamp: string): string;
export declare function formatDateSeparator(date: Date): {
    label: string;
    isToday: boolean;
};
