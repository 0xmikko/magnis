/** Sync progress per source — the typed SAME-UNIT pair from `sync.progress`.
 *  `discovered` is the connector's cumulative primary-item count (latest
 *  event wins — NEVER an accumulated envelope sum: `ingested` counts
 *  envelopes per cycle and double-counts across reconnects, and pairing it
 *  with `total` was the "62,548 / 2,593" StatusBar lie). */
export interface SyncProgress {
    readonly sourceId: string;
    readonly moduleId: string;
    /** Cumulative primary items discovered (same units as `total`); 0 = the
     *  source has not reported one. */
    readonly discovered: number;
    /** Estimated total primary items (from source, if available). */
    readonly total: number | null;
    readonly phase: string;
}
/** Index progress — separate from sync, shown as permanent indicator. */
export interface IndexProgress {
    readonly indexed: number;
    readonly total: number;
}
export interface UseSyncStatusResult {
    /** Latest status message to show in StatusBar (replaces previous). */
    readonly latestStatus: {
        readonly sourceId: string;
        readonly message: string;
    } | null;
    /** Index progress — separate permanent indicator. */
    readonly indexProgress: IndexProgress | null;
    /** Accumulated sync progress per source (source_id → SyncProgress). */
    readonly syncProgress: ReadonlyMap<string, SyncProgress>;
}
/**
 * The status bar's live feed: `sync.progress` (per-cycle, same-unit pair)
 * and `app.index_progress` (the search indexer). Push-based over the
 * WebSocket event stream — no RPC, no polling. (The application-log half
 * that used to live beside this — `logs.recent`, `app.error`, `app.status`
 * — was deleted with the user-facing log feature: the process log is read
 * by humans and agents, not by the app.)
 */
export declare function useSyncStatus(): UseSyncStatusResult;
