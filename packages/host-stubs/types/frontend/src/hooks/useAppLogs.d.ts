export interface LogOrigin {
    readonly kind: "source" | "module" | "service";
    readonly id: string;
}
export interface LogEntity {
    readonly id: string;
    readonly timestamp: string;
    readonly level: "debug" | "info" | "warn" | "error";
    readonly category: "sync" | "index" | "auth" | "network" | "system";
    readonly origin: LogOrigin;
    readonly message: string;
    readonly metadata: Record<string, unknown> | null;
    readonly show_in_status: boolean;
}
export interface ErrorGroup {
    readonly entry: LogEntity;
    readonly count: number;
    readonly first_seen: string;
    readonly last_seen: string;
}
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
    /** Latest status message (from app.status). */
    readonly message: string | null;
}
/** Index progress — separate from sync, shown as permanent indicator. */
export interface IndexProgress {
    readonly indexed: number;
    readonly total: number;
}
export interface UseAppLogsResult {
    /** Latest status message to show in StatusBar (replaces previous). */
    readonly latestStatus: {
        readonly sourceId: string;
        readonly message: string;
    } | null;
    /** Index progress — separate permanent indicator. */
    readonly indexProgress: IndexProgress | null;
    /** Accumulated sync progress per source (source_id → SyncProgress). */
    readonly syncProgress: ReadonlyMap<string, SyncProgress>;
    /** Deduplicated error groups (from backend). */
    readonly errorGroups: readonly ErrorGroup[];
    /** Total error group count (for badge). */
    readonly errorCount: number;
    /** Query full log history via RPC (for LogViewer). */
    readonly queryLogs: (params?: Record<string, unknown>) => Promise<{
        logs: readonly LogEntity[];
        total: number;
    }>;
}
/**
 * Centralized log consumer.
 *
 * - On mount: calls RPC `logs.recent` for initial state
 * - Real-time: subscribes to `app.status` + `app.error` + `sync.progress`
 * - Accumulates sync progress (running total of ingested items per source)
 */
export declare function useAppLogs(): UseAppLogsResult;
