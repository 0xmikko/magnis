import type { AccountSyncState, CanonicalEntityProgress, RepairAction, SourceAccountStatus, SourceAvailability, SourceCredentialStatus, SourceRuntimeStatus, SourceStatus } from "@magnis/sdk";
export type { AccountSyncState, RepairAction, SourceAccountStatus, SourceAvailability, SourceCredentialStatus, SourceRuntimeStatus, SourceStatus, SourceStatusListResponse, } from "@magnis/sdk";
export type Account = SourceAccountStatus;
export type Tone = "green" | "blue" | "amber" | "red" | "grey";
export interface Badge {
    readonly label: string;
    readonly tone: Tone;
}
export declare function repairLabel(repair: RepairAction): string;
export declare function sourceAvailabilityBadge(availability: SourceAvailability): Badge;
export declare function accountLifecycleBadge(account: SourceAccountStatus): Badge;
export declare function credentialBadge(credential: SourceCredentialStatus): Badge;
export declare function runtimeBadge(runtime: SourceRuntimeStatus): Badge;
/** The status line of one surface, from its sync alone: the stage or the
 * hold with its numbers — the estimate, the next check, the retry — printed
 * against `now`. `Not started` for a surface without a worker. */
export declare function statusLine(sync: AccountSyncState | null, now: Date): Badge;
/** A surface whose history is done and whose worker only waits for the Source:
 * live, or polling for its next moment. The panel, the StatusBar and the setup
 * flow ask this and decide nothing else about the state. */
export declare function isSettled(sync: AccountSyncState | null): boolean;
/** One entity schema's saved count, with its stated total when it is not
 * smaller than the saved count. A new pass can reset the estimate without
 * removing Graph data, so a smaller estimate cannot be a denominator.
 * @tested-by: tst_fe_status_golden_007 */
export declare function entityCount(progress: CanonicalEntityProgress): string;
/** The same volume as one sentence, for a reader that has no columns. */
export declare function entityLine(progress: CanonicalEntityProgress): string;
export declare function sourceCounterLine(source: SourceStatus): string;
