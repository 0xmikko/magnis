/**
 * useMentionSearch — searches entities by name for @-mention autocomplete.
 */
import type { EntitySearchHit } from "@magnis/sdk";
interface UseMentionSearchResult {
    readonly results: readonly EntitySearchHit[];
    readonly isLoading: boolean;
}
export declare function useMentionSearch(query: string, active: boolean, schemaFilter?: string): UseMentionSearchResult;
export {};
