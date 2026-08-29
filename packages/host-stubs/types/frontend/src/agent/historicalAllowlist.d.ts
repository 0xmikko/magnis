import type { ResolvedDecision } from "@magnis/client-core";
export declare function autoApprovalAttemptKey(episodeId: string | null, toolCallId: string): string;
export declare function startAllowlistedApproval(episodeId: string | null, toolCallId: string, attempted: Set<string>, approve: () => Promise<void>): void;
export declare function shouldRenderHistoricalAllowlistCard(decision: ResolvedDecision | null, toolCallStatus: "pending" | "approved" | "denied", hasMatchingGrant: boolean): boolean;
