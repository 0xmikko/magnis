import type { AccountSyncState } from "@magnis/sdk";
import { type SourceStatus } from "../api/sourceStatus";
export interface SourceStatusFeed {
    readonly sources: readonly SourceStatus[];
    readonly loading: boolean;
    readonly loadError: string | null;
    readonly refresh: () => void;
}
/**
 * The `source.status.list` read the Accounts panel and the StatusBar share:
 * one request at a time, one re-read on the next task after the first
 * `sync.status_changed` or `source.account.connected` of a burst. A replaced
 * transport starts over and never renders the previous workspace's rows.
 *
 * @tested-by: tst_fe_unit_accounts_034, tst_fe_unit_syncstatus_001
 */
export declare function useSourceStatus(): SourceStatusFeed;
/** The surface the StatusBar names, with the Source it belongs to. */
export interface ActiveSync {
    readonly sourceId: string;
    readonly displayName: string;
    readonly sync: AccountSyncState;
}
/** The first surface whose worker is at work or held; live and polling
 * surfaces, and surfaces without a worker, are passed over. */
export declare function activeSync(sources: readonly SourceStatus[]): ActiveSync | null;
/** Index progress — separate from sync, shown as permanent indicator. */
export interface IndexProgress {
    readonly indexed: number;
    readonly total: number;
}
export interface UseSyncStatusResult {
    /** The surface the StatusBar names, or null when every worker is settled. */
    readonly active: ActiveSync | null;
    /** Index progress — separate permanent indicator. */
    readonly indexProgress: IndexProgress | null;
}
/**
 * The status bar's feed: the shared `source.status.list` read, narrowed to
 * the one surface worth naming, and `app.indexProgress` (the search
 * indexer) pushed over the WebSocket event stream.
 *
 * @tested-by: tst_fe_unit_syncstatus_001..003
 */
export declare function useSyncStatus(): UseSyncStatusResult;
