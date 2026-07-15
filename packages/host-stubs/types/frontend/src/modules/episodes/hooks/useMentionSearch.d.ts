/**
 * useMentionSearch — searches entities by name for @-mention autocomplete.
 */
import type { EntitySearchResult } from "../types";
interface UseMentionSearchResult {
    readonly results: readonly EntitySearchResult[];
    readonly isLoading: boolean;
}
export declare function useMentionSearch(query: string, active: boolean, schemaFilter?: string): UseMentionSearchResult;
export {};
